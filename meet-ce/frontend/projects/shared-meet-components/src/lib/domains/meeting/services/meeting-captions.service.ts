import { Injectable, inject, signal } from '@angular/core';
import { ILogger, LoggerService, ParticipantService, Room, TextStreamReader } from 'openvidu-components-angular';
import { Caption, CaptionsConfig } from '../models/captions.model';
import { CustomParticipantModel } from '../models/custom-participant.model';

/**
 * Service responsible for managing live transcription captions.
 *
 * This service:
 * - Registers text stream handlers for LiveKit transcriptions
 * - Manages caption lifecycle (creation, updates, expiration)
 * - Handles both interim and final transcriptions
 * - Provides reactive signals for UI consumption
 *
 * Follows the single responsibility principle by focusing solely on caption management.
 */
@Injectable({
	providedIn: 'root'
})
export class MeetingCaptionsService {
	private readonly loggerService = inject(LoggerService);
	private readonly logger: ILogger;
	private readonly participantService = inject(ParticipantService);

	// Configuration with defaults
	private readonly defaultConfig: Required<CaptionsConfig> = {
		maxVisibleCaptions: 3,
		finalCaptionDuration: 5000,
		interimCaptionDuration: 3000,
		showInterimTranscriptions: true
	};

	private config: Required<CaptionsConfig> = { ...this.defaultConfig };

	// Store room reference for dynamic subscription
	private room: Room | null = null;

	// Reactive state
	private readonly _captions = signal<Caption[]>([]);
	private readonly _areCaptionsEnabledByUser = signal<boolean>(false);

	/**
	 * Current list of active captions
	 */
	readonly captions = this._captions.asReadonly();
	/**
	 * Whether captions are enabled by the user
	 */
	readonly areCaptionsEnabledByUser = this._areCaptionsEnabledByUser.asReadonly();

	// Map to track expiration timeouts
	private expirationTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	// Map to track interim captions by participant and track
	private interimCaptionMap = new Map<string, string>(); // key: `${participantIdentity}-${trackId}`

	constructor() {
		this.logger = this.loggerService.get('OpenVidu Meet - MeetingCaptionsService');
	}
	/**
	 * Initializes the captions service by registering text stream handlers.
	 *
	 * @param room The LiveKit Room instance
	 * @param config Optional configuration for caption behavior
	 */
	initialize(room: Room, config?: CaptionsConfig): void {
		if (!room) {
			this.logger.e('Cannot initialize captions: room is undefined');
			return;
		}

		// Store room reference
		this.room = room;

		// Merge provided config with defaults
		this.config = { ...this.defaultConfig, ...config };

		this.logger.d('Meeting Captions service initialized (ready to subscribe)');
	}

	/**
	 * Enables captions by registering the transcription handler.
	 * This is called when the user activates captions.
	 */
	enable(): void {
		if (!this.room) {
			this.logger.e('Cannot enable captions: room is not initialized');
			return;
		}

		if (this._areCaptionsEnabledByUser()) {
			this.logger.d('Captions already enabled');
			return;
		}

		// Register the LiveKit transcription handler
		this.room.registerTextStreamHandler('lk.transcription', this.handleTranscription.bind(this));

		this._areCaptionsEnabledByUser.set(true);
		this.logger.d('Captions enabled');
	}

	/**
	 * Disables captions by clearing all captions and stopping transcription.
	 * This is called when the user deactivates captions.
	 */
	disable(): void {
		if (!this._areCaptionsEnabledByUser()) {
			this.logger.d('Captions already disabled');
			return;
		}

		// Clear all active captions
		this.clearAllCaptions();

		this._areCaptionsEnabledByUser.set(false);
		this.room?.unregisterTextStreamHandler('lk.transcription');
		this.logger.d('Captions disabled');
	}

	/**
	 * Cleans up all captions and timers.
	 */
	destroy(): void {
		this.clearAllCaptions();
		this.room = null;
		this._areCaptionsEnabledByUser.set(false);
		this.logger.d('Meeting Captions service destroyed');
	}

	/**
	 * Manually clears all active captions.
	 */
	clearAllCaptions(): void {
		// Clear all expiration timers
		this.expirationTimeouts.forEach((timeout) => clearTimeout(timeout));
		this.expirationTimeouts.clear();
		this.interimCaptionMap.clear();

		// Clear captions
		this._captions.set([]);
		this.logger.d('All captions cleared');
	}

	/**
	 * Handles incoming transcription data.
	 *
	 * @param data Transcription data from LiveKit
	 */
	private async handleTranscription(
		reader: TextStreamReader,
		{ identity: participantIdentity }: { identity: string }
	): Promise<void> {
		try {
			const text = await reader.readAll();
			const isFinal = reader.info.attributes?.['lk.transcription_final'] === 'true';
			const trackId = reader.info.attributes?.['lk.transcribed_track_id'] || '';

			if (!text || text.trim() === '') {
				return;
			}

			// Get full participant model from ParticipantService
			const participant = this.participantService.getParticipantByIdentity(
				participantIdentity
			) as CustomParticipantModel;
			if (!participant) {
				this.logger.e(`Participant with identity ${participantIdentity} not found for transcription`);
				return;
			}

			// Generate a unique key for this participant's track
			const key = `${participantIdentity}-${trackId}`;

			if (isFinal) {
				// Handle final transcription
				this.handleFinalTranscription(key, participant, text, trackId);
			} else {
				// Handle interim transcription (if enabled)
				if (this.config.showInterimTranscriptions) {
					this.handleInterimTranscription(key, participant, text, trackId);
				}
			}
		} catch (error) {
			this.logger.e('Error reading transcription stream:', error);
		}
	}

	/**
	 * Handles final transcription by creating or updating a caption.
	 *
	 * @param key Unique key for the participant's track
	 * @param participantIdentity Participant identity
	 * @param participantName Participant display name
	 * @param text Transcribed text
	 * @param trackId Track ID being transcribed
	 */
	private handleFinalTranscription(
		key: string,
		participant: CustomParticipantModel,
		text: string,
		trackId: string
	): void {
		const currentCaptions = this._captions();

		const displayName = participant?.name || participant?.identity;

		// Check if there's an interim caption for this key
		const interimCaptionId = this.interimCaptionMap.get(key);

		if (interimCaptionId) {
			// Update existing interim caption to final
			const updatedCaptions = currentCaptions.map((caption) => {
				if (caption.id === interimCaptionId) {
					// Clear old expiration timer
					this.clearExpirationTimer(caption.id);

					// Return updated caption
					return {
						...caption,
						text,
						isFinal: true,
						timestamp: Date.now(),
						participantName: participant.name || participant.identity,
						participantColor: participant.colorProfile
					};
				}
				return caption;
			});

			this._captions.set(updatedCaptions);

			// Set new expiration timer
			this.setExpirationTimer(interimCaptionId, this.config.finalCaptionDuration);

			// Remove from interim map
			this.interimCaptionMap.delete(key);
		} else {
			// Create new final caption
			this.addNewCaption(participant, text, trackId, true);
		}

		this.logger.d(`Final transcription for ${displayName}: "${text}"`);
	}

	/**
	 * Handles interim transcription by creating or updating a caption.
	 *
	 * @param key Unique key for the participant's track
	 * @param participantIdentity Participant identity
	 * @param participantName Participant display name
	 * @param text Transcribed text
	 * @param trackId Track ID being transcribed
	 */
	private handleInterimTranscription(
		key: string,
		participant: CustomParticipantModel,
		text: string,
		trackId: string
	): void {
		const currentCaptions = this._captions();
		const participantName = participant.name || participant.identity;

		// Check if there's already an interim caption for this key
		const existingInterimId = this.interimCaptionMap.get(key);

		if (existingInterimId) {
			// Update existing interim caption
			const updatedCaptions = currentCaptions.map((caption) => {
				if (caption.id === existingInterimId) {
					// Clear old expiration timer
					this.clearExpirationTimer(caption.id);

					// Return updated caption
					return {
						...caption,
						text,
						timestamp: Date.now(),
						participantName: participant.name || participant.identity,
						participantColor: participant.colorProfile
					};
				}
				return caption;
			});

			this._captions.set(updatedCaptions);

			// Reset expiration timer
			this.setExpirationTimer(existingInterimId, this.config.interimCaptionDuration);
		} else {
			// Create new interim caption
			const captionId = this.addNewCaption(participant, text, trackId, false);

			// Track this interim caption
			this.interimCaptionMap.set(key, captionId);
		}

		this.logger.d(`Interim transcription for ${participantName}: "${text}"`);
	}

	/**
	 * Adds a new caption to the list.
	 *
	 * @param participantIdentity Participant identity
	 * @param participantName Participant display name
	 * @param text Transcribed text
	 * @param trackId Track ID being transcribed
	 * @param isFinal Whether this is a final transcription
	 * @returns The ID of the created caption
	 */
	private addNewCaption(
		participant: CustomParticipantModel,
		text: string,
		trackId: string,
		isFinal: boolean
	): string {
		const caption: Caption = {
			id: this.generateCaptionId(),
			participantIdentity: participant.identity,
			participantName: participant.name || participant.identity,
			participantColor: participant.colorProfile,
			text,
			isFinal,
			trackId,
			timestamp: Date.now()
		};

		const currentCaptions = this._captions();

		// Add new caption and limit total number
		const updatedCaptions = [...currentCaptions, caption].slice(-this.config.maxVisibleCaptions);

		this._captions.set(updatedCaptions);

		// Set expiration timer
		const duration = isFinal ? this.config.finalCaptionDuration : this.config.interimCaptionDuration;
		this.setExpirationTimer(caption.id, duration);

		return caption.id;
	}

	/**
	 * Sets an expiration timer for a caption.
	 *
	 * @param captionId Caption ID
	 * @param duration Duration in milliseconds
	 */
	private setExpirationTimer(captionId: string, duration: number): void {
		// Clear existing timer if any
		this.clearExpirationTimer(captionId);

		// Set new timer
		const timeout = setTimeout(() => {
			this.removeCaption(captionId);
		}, duration);

		this.expirationTimeouts.set(captionId, timeout);
	}

	/**
	 * Clears the expiration timer for a caption.
	 *
	 * @param captionId Caption ID
	 */
	private clearExpirationTimer(captionId: string): void {
		const timeout = this.expirationTimeouts.get(captionId);
		if (timeout) {
			clearTimeout(timeout);
			this.expirationTimeouts.delete(captionId);
		}
	}

	/**
	 * Removes a caption from the list.
	 *
	 * @param captionId Caption ID to remove
	 */
	private removeCaption(captionId: string): void {
		this.clearExpirationTimer(captionId);

		const currentCaptions = this._captions();
		const updatedCaptions = currentCaptions.filter((caption) => caption.id !== captionId);

		this._captions.set(updatedCaptions);

		// Clean up interim map if necessary
		for (const [key, id] of this.interimCaptionMap.entries()) {
			if (id === captionId) {
				this.interimCaptionMap.delete(key);
				break;
			}
		}

		this.logger.d(`Caption ${captionId} removed`);
	}

	/**
	 * Generates a unique caption ID.
	 *
	 * @returns Unique caption ID
	 */
	private generateCaptionId(): string {
		return `caption-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}
}
