import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { Participant, Room } from 'livekit-client';
import { LayoutService, LoggerService, ViewportService } from 'openvidu-components-angular';
import { MeetStorageService } from '.';
import { MeetLayoutMode } from '../models';

@Injectable({ providedIn: 'root' })
export class MeetLayoutService extends LayoutService {
	private readonly destroyRef = inject(DestroyRef);
	private readonly DEFAULT_MAX_SPEAKERS = 4;

	readonly MIN_REMOTE_SPEAKERS = 1;
	readonly MAX_REMOTE_SPEAKERS_LIMIT = 6;

	// ==============================================================================================
	// SMART MOSAIC CONFIGURATION
	// ==============================================================================================

	/**
	 * Minimum audio level threshold (0-1) to consider a participant as actively speaking.
	 * Filters out background noise, coughs, and brief sounds.
	 */
	private readonly AUDIO_LEVEL_THRESHOLD = 0.1;

	/**
	 * Minimum duration in milliseconds that a participant must be speaking
	 * before being considered for display in the smart layout.
	 */
	private readonly MIN_SPEAKING_DURATION_MS = 1200;

	/**
	 * Grace period in milliseconds to keep tracking a speaker after they stop.
	 * Prevents resetting the speaking timer due to brief VAD gaps.
	 */
	private readonly SPEAKING_GRACE_PERIOD_MS = 3000;

	// ==============================================================================================
	// STATE SIGNALS
	// ==============================================================================================

	private readonly _layoutMode = signal<MeetLayoutMode>(MeetLayoutMode.MOSAIC);
	readonly layoutMode = this._layoutMode.asReadonly();

	private readonly _maxRemoteSpeakers = signal<number>(this.DEFAULT_MAX_SPEAKERS);
	readonly maxRemoteSpeakers = this._maxRemoteSpeakers.asReadonly();

	readonly isSmartMosaicEnabled = computed(() => this._layoutMode() === MeetLayoutMode.SMART_MOSAIC);

	/**
	 * Ordered list of participant IDs based on their speaking priority.
	 * - Active speakers are prioritized at the top.
	 * - Inactive speakers are pushed to the bottom but kept for history.
	 */
	private readonly _speakerPriorityOrder = signal<string[]>([]);
	readonly speakerPriorityOrder = this._speakerPriorityOrder.asReadonly();

	// ==============================================================================================
	// INTERNAL STATE TRACKING
	// ==============================================================================================

	/**
	 * Tracks the timestamp when each participant started their current speaking session.
	 * Used to enforce minimum speaking duration before considering them for display.
	 */
	private speakingStartTimes = new Map<string, number>();

	/**
	 * Tracks when each participant last stopped speaking.
	 * Used to implement grace period before removing their start time.
	 */
	private speakingStopTimes = new Map<string, number>();

	private currentRoom: Room | null = null;
	private isSpeakerTrackingActive = false;

	constructor(
		protected loggerService: LoggerService,
		protected viewPortService: ViewportService,
		private storageService: MeetStorageService
	) {
		super(loggerService, viewPortService);
		this.log = this.loggerService.get('MeetLayoutService');

		this.loadLayoutModeFromStorage();
		this.loadMaxSpeakersFromStorage();
		this.setupStoragePersistence();
	}

	// ==============================================================================================
	// PUBLIC API
	// ==============================================================================================

	/**
	 * Sets the layout mode and updates the view.
	 * @param mode The new layout mode to set.
	 */
	setLayoutMode(mode: MeetLayoutMode): void {
		if (!Object.values(MeetLayoutMode).includes(mode)) {
			this.log.w(`Invalid layout mode: ${mode}`);
			return;
		}
		if (this._layoutMode() === mode) return;

		this._layoutMode.set(mode);
		this.update();
	}

	/**
	 * Sets the maximum number of remote speakers to display in Smart Mosaic mode.
	 * @param count The number of speakers (between MIN and MAX limits).
	 */
	setMaxRemoteSpeakers(count: number): void {
		if (count < this.MIN_REMOTE_SPEAKERS || count > this.MAX_REMOTE_SPEAKERS_LIMIT) {
			this.log.w(
				`Invalid speaker count: ${count}. Range: ${this.MIN_REMOTE_SPEAKERS}-${this.MAX_REMOTE_SPEAKERS_LIMIT}`
			);
			return;
		}
		if (this._maxRemoteSpeakers() === count) return;

		this._maxRemoteSpeakers.set(count);
		if (this.isSmartMosaicEnabled()) this.update();
	}

	/**
	 * Initializes speaker tracking for the given room.
	 * Subscribes to 'activeSpeakersChanged' events.
	 * @param room The LiveKit Room instance.
	 */
	initializeSpeakerTracking(room: Room): void {
		if (this.isSpeakerTrackingActive) return;

		this.currentRoom = room;
		this.isSpeakerTrackingActive = true;
		room.on('activeSpeakersChanged', this.handleActiveSpeakersChanged);

		this.destroyRef.onDestroy(() => this.cleanupSpeakerTracking());
	}

	/**
	 * Cleans up speaker tracking resources and subscriptions.
	 */
	cleanupSpeakerTracking(): void {
		this.currentRoom?.off('activeSpeakersChanged', this.handleActiveSpeakersChanged);
		this.currentRoom = null;
		this._speakerPriorityOrder.set([]);
		this.speakingStartTimes.clear();
		this.speakingStopTimes.clear();
		this.isSpeakerTrackingActive = false;
	}

	/**
	 * Removes participant IDs from the speaker priority order that are not in the set of connected participants.
	 * @param connectedParticipantIds Set of participant IDs that are currently connected.
	 */
	removeDisconnectedSpeakers(connectedParticipantIds: Set<string>): void {
		const currentOrder = this._speakerPriorityOrder();
		const filteredOrder = currentOrder.filter((id) => connectedParticipantIds.has(id));

		if (filteredOrder.length !== currentOrder.length) {
			this._speakerPriorityOrder.set(filteredOrder);
		}
	}

	/**
	 * Determines the set of participant IDs to display by prioritizing the most
	 * recent speakers and filling remaining slots with other available participants.
	 * Ensures the result does not exceed the maximum number of remote speakers.
	 * @param availableIds Set of participant IDs currently available for selection.
	 * @returns Set of participant IDs selected for display.
	 */
	computeParticipantsToDisplay(availableIds: Set<string>): Set<string> {
		const maxCount = this._maxRemoteSpeakers();
		const speakerOrder = this._speakerPriorityOrder();

		const recentSpeakers = speakerOrder.filter((id) => availableIds.has(id)).slice(0, maxCount);

		if (recentSpeakers.length >= maxCount) {
			return new Set(recentSpeakers);
		}

		const recentSpeakerSet = new Set(recentSpeakers);
		const fillersNeeded = maxCount - recentSpeakers.length;
		const fillers = [...availableIds].filter((id) => !recentSpeakerSet.has(id)).slice(0, fillersNeeded);

		return new Set([...recentSpeakers, ...fillers]);
	}

	// ==============================================================================================
	// PRIVATE HELPERS
	// ==============================================================================================

	private loadLayoutModeFromStorage(): void {
		const storedMode = this.storageService.getLayoutMode();
		if (storedMode) this.setLayoutMode(storedMode);
	}

	private loadMaxSpeakersFromStorage(): void {
		const storedCount = this.storageService.getMaxRemoteSpeakers();
		if (storedCount) this.setMaxRemoteSpeakers(storedCount);
	}

	private setupStoragePersistence(): void {
		effect(() => this.storageService.setLayoutMode(this._layoutMode()));
		effect(() => this.storageService.setMaxRemoteSpeakers(this._maxRemoteSpeakers()));
	}

	/**
	 * Handles the 'activeSpeakersChanged' event from LiveKit.
	 * @param speakers Array of currently active speaker participants.
	 * @returns
	 */
	private readonly handleActiveSpeakersChanged = (speakers: Participant[]): void => {
		if (!this.isSmartMosaicEnabled()) return;

		const now = Date.now();

		// 1. Filter for "Loud" speakers (above threshold)
		// These are the only ones we consider "physically speaking" right now.
		// We ignore low-volume noise (treating it as silence).
		const loudSpeakers = speakers.filter((p) => !p.isLocal && p.audioLevel >= this.AUDIO_LEVEL_THRESHOLD);
		const loudSpeakerIds = new Set(loudSpeakers.map((p) => p.identity));

		// 2. Update start/stop times based on LOUD speakers only.
		this.updateSpeakerActivityTimers(loudSpeakerIds, now);

		// 3. Determine who should be considered "Active" for the Layout.
		// This includes:
		// A. Currently Loud speakers who have spoken long enough.
		// B. Recently stopped speakers (Grace Period) who spoke long enough.
		const activeForLayoutIds: string[] = [];

		// Check all tracked speakers (both currently speaking and recently stopped)
		for (const [id, startTime] of this.speakingStartTimes) {
			const isLoud = loudSpeakerIds.has(id);
			const stopTime = this.speakingStopTimes.get(id);

			// Calculate duration
			// If currently loud, duration is now - start.
			// If stopped, duration is stop - start.
			const endTime = isLoud ? now : stopTime || now;
			const duration = endTime - startTime;

			if (duration >= this.MIN_SPEAKING_DURATION_MS) {
				activeForLayoutIds.push(id);
			}
		}

		// Always update priority to ensure inactive speakers are moved to the bottom
		this.updateSpeakerPriority(activeForLayoutIds);
	};

	/**
	 * Updates the internal timers for speaker activity.
	 * - Starts a timer for new loud speakers.
	 * - Stops the timer (records stop time) for speakers who went silent.
	 * - Clears timers for speakers who have been silent longer than the grace period.
	 *
	 * @param currentLoudSpeakerIds Set of participant IDs currently exceeding the audio threshold.
	 * @param now Current timestamp.
	 */
	private updateSpeakerActivityTimers(currentLoudSpeakerIds: Set<string>, now: number): void {
		// Handle speakers who are currently active
		for (const id of currentLoudSpeakerIds) {
			// If speaker is back, clear their stop time (they're speaking again)
			this.speakingStopTimes.delete(id);

			// Only set start time if they don't have one (new speaker or grace period expired)
			if (!this.speakingStartTimes.has(id)) {
				this.speakingStartTimes.set(id, now);
			}
		}

		// Handle speakers who stopped - use grace period instead of immediate removal
		for (const id of this.speakingStartTimes.keys()) {
			if (!currentLoudSpeakerIds.has(id)) {
				// Mark when they stopped (if not already marked)
				if (!this.speakingStopTimes.has(id)) {
					this.speakingStopTimes.set(id, now);
				}

				// Check if grace period has elapsed
				const stopTime = this.speakingStopTimes.get(id)!;
				if (now - stopTime >= this.SPEAKING_GRACE_PERIOD_MS) {
					this.speakingStartTimes.delete(id);
					this.speakingStopTimes.delete(id);
				}
			}
		}
	}

	/**
	 * Updates the priority order of speakers for the Smart Mosaic layout.
	 * Implements a "VIP Queue" strategy:
	 * 1. Active speakers are moved to the front (VIPs), maintaining their relative order.
	 * 2. New active speakers are appended after existing active ones.
	 * 3. Inactive speakers are pushed to the back.
	 *
	 * @param activeSpeakerIds List of participant IDs considered active by the algorithm.
	 */
	private updateSpeakerPriority(activeSpeakerIds: string[]): void {
		const currentOrder = this._speakerPriorityOrder();
		const activeSet = new Set(activeSpeakerIds);

		// 1. Existing Active Speakers: Keep them at the top, maintaining their relative order.
		// This prevents swapping when multiple people are speaking.
		const existingActive = currentOrder.filter((id) => activeSet.has(id));

		// 2. New Active Speakers: Append them after the existing active ones.
		const newActive = activeSpeakerIds.filter((id) => !currentOrder.includes(id));

		// 3. Inactive Speakers: Keep them in history but push to the bottom.
		const inactive = currentOrder.filter((id) => !activeSet.has(id));

		// Construct new order: [Existing Active] + [New Active] + [Inactive History]
		const newOrder = [...existingActive, ...newActive, ...inactive];

		// Limit history size to prevent memory leaks, but keep enough buffer
		const maxHistorySize = this._maxRemoteSpeakers() * 2;
		this._speakerPriorityOrder.set(newOrder.slice(0, maxHistorySize));
	}
}
