import { Injectable, inject } from '@angular/core';
import {
	LeftEventReason,
	MeetParticipantRoleUpdatedPayload,
	MeetRoomConfigUpdatedPayload,
	MeetSignalType,
	WebComponentEvent,
	WebComponentOutboundEventMessage
} from '@openvidu-meet/typings';
import {
	DataPacket_Kind,
	ParticipantLeftEvent,
	ParticipantLeftReason,
	ParticipantModel,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent,
	RemoteParticipant,
	Room,
	RoomEvent
} from 'openvidu-components-angular';
import { CustomParticipantModel } from '../../models';
import {
	FeatureConfigurationService,
	MeetingContextService,
	NavigationService,
	RecordingService,
	RoomMemberService,
	SessionStorageService,
	TokenStorageService,
	WebComponentManagerService
} from '../../services';

/**
 * Service that handles all LiveKit/OpenVidu room events.
 *
 * This service encapsulates all event handling logic and updates the MeetingContextService
 * as the single source of truth for meeting state.
 */
@Injectable()
export class MeetingEventHandlerService {
	protected meetingContext = inject(MeetingContextService);
	protected featureConfService = inject(FeatureConfigurationService);
	protected recordingService = inject(RecordingService);
	protected roomMemberService = inject(RoomMemberService);
	protected sessionStorageService = inject(SessionStorageService);
	protected tokenStorageService = inject(TokenStorageService);
	protected wcManagerService = inject(WebComponentManagerService);
	protected navigationService = inject(NavigationService);

	// ============================================
	// PUBLIC METHODS - Room Event Handlers
	// ============================================

	/**
	 * Sets up all room event listeners when room is created.
	 * This is the main entry point for room event handling.
	 *
	 * @param room The LiveKit Room instance
	 */
	setupRoomListeners(room: Room): void {
		this.setupDataReceivedListener(room);
	}

	/**
	 * Sets up the DataReceived event listener for handling room signals
	 * @param room The LiveKit Room instance
	 */
	private setupDataReceivedListener(room: Room): void {
		room.on(
			RoomEvent.DataReceived,
			async (payload: Uint8Array, _participant?: RemoteParticipant, _kind?: DataPacket_Kind, topic?: string) => {
				// Only process topics that this handler is responsible for
				const relevantTopics = [
					'recordingStopped',
					MeetSignalType.MEET_ROOM_CONFIG_UPDATED,
					MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED
				];

				if (!topic || !relevantTopics.includes(topic)) {
					return;
				}

				try {
					const event = JSON.parse(new TextDecoder().decode(payload));

					switch (topic) {
						case 'recordingStopped':
							// Update hasRecordings in MeetingContextService
							this.meetingContext.setHasRecordings(true);
							break;

						case MeetSignalType.MEET_ROOM_CONFIG_UPDATED:
							// Room cannot be updated if a meeting is ongoing
							// await this.handleRoomConfigUpdated(event);
							break;

						case MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED:
							await this.handleParticipantRoleUpdated(event);
							break;
					}
				} catch (error) {
					console.warn(`Failed to parse data message for topic: ${topic}`, error);
				}
			}
		);
	}

	/**
	 * Handles participant connected event.
	 * Sends JOINED event to parent window (for web component integration).
	 *
	 * Arrow function ensures correct 'this' binding when called from template.
	 *
	 * @param event Participant model from OpenVidu
	 */
	onParticipantConnected = (event: ParticipantModel): void => {
		const message: WebComponentOutboundEventMessage<WebComponentEvent.JOINED> = {
			event: WebComponentEvent.JOINED,
			payload: {
				roomId: event.getProperties().room?.name || '',
				participantIdentity: event.identity
			}
		};
		this.wcManagerService.sendMessageToParent(message);
	};

	/**
	 * Handles participant left event.
	 * - Maps technical reason to user-friendly reason
	 * - Sends LEFT event to parent window
	 * - Cleans up session storage (secrets, tokens)
	 * - Navigates to disconnected page
	 *
	 * Arrow function ensures correct 'this' binding when called from template.
	 *
	 * @param event Participant left event from OpenVidu
	 */
	onParticipantLeft = async (event: ParticipantLeftEvent): Promise<void> => {
		let leftReason = this.mapLeftReason(event.reason);

		// If meeting was ended by this user, update reason
		const meetingEndedBy = this.meetingContext.meetingEndedBy();
		if (leftReason === LeftEventReason.MEETING_ENDED && meetingEndedBy === 'self') {
			leftReason = LeftEventReason.MEETING_ENDED_BY_SELF;
		}

		// Send LEFT event to parent window
		const message: WebComponentOutboundEventMessage<WebComponentEvent.LEFT> = {
			event: WebComponentEvent.LEFT,
			payload: {
				roomId: event.roomName,
				participantIdentity: event.participantName,
				reason: leftReason
			}
		};
		this.wcManagerService.sendMessageToParent(message);

		// Clear participant identity and token
		this.roomMemberService.clearParticipantIdentity();
		this.tokenStorageService.clearRoomMemberToken();

		// Clean up room secret and e2ee key (if any), except on browser unload)
		if (event.reason !== ParticipantLeftReason.BROWSER_UNLOAD) {
			this.sessionStorageService.removeRoomSecret();
			this.sessionStorageService.removeE2EEKey();
		}

		// Navigate to disconnected page
		await this.navigationService.navigateTo('disconnected', { reason: leftReason }, true);
	};

	/**
	 * Handles recording start request event.
	 *
	 * Arrow function ensures correct 'this' binding when called from template.
	 *
	 * @param event Recording start requested event from OpenVidu
	 */
	onRecordingStartRequested = async (event: RecordingStartRequestedEvent): Promise<void> => {
		try {
			await this.recordingService.startRecording(event.roomName);
		} catch (error: any) {
			if (error.status === 503) {
				console.error(
					'No egress service available. Check CPU usage or Media Node capacity. ' +
						'By default, a recording uses 2 CPUs per room.'
				);
			} else {
				console.error('Error starting recording:', error);
			}
		}
	};

	/**
	 * Handles recording stop request event.
	 *
	 * Arrow function ensures correct 'this' binding when called from template.
	 *
	 * @param event Recording stop requested event from OpenVidu
	 */
	onRecordingStopRequested = async (event: RecordingStopRequestedEvent): Promise<void> => {
		try {
			await this.recordingService.stopRecording(event.recordingId);
		} catch (error) {
			console.error('Error stopping recording:', error);
		}
	};

	// ============================================
	// PRIVATE METHODS - Event Handlers
	// ============================================

	/**
	 * Handles room config updated event.
	 * Updates feature config and refreshes room member token if needed.
	 * Obtains roomId and roomSecret from MeetingContextService.
	 */
	private async handleRoomConfigUpdated(event: MeetRoomConfigUpdatedPayload): Promise<void> {
		const { config } = event;

		// Update feature configuration
		this.featureConfService.setRoomConfig(config);

		// Refresh room member token if recording is enabled
		if (config.recording.enabled) {
			try {
				const roomId = this.meetingContext.roomId();
				const roomSecret = this.meetingContext.roomSecret();
				const participantName = this.roomMemberService.getParticipantName();
				const participantIdentity = this.roomMemberService.getParticipantIdentity();

				if (!roomId || !roomSecret) {
					console.error('Room ID or secret not available for token refresh');
					return;
				}

				await this.roomMemberService.generateToken(roomId, {
					secret: roomSecret,
					grantJoinMeetingPermission: true,
					participantName,
					participantIdentity
				});
			} catch (error) {
				console.error('Error refreshing room member token:', error);
			}
		}
	}

	/**
	 * Handles participant role updated event.
	 * Updates local or remote participant role and refreshes room member token if needed.
	 * Obtains all necessary data from MeetingContextService.
	 */
	private async handleParticipantRoleUpdated(event: MeetParticipantRoleUpdatedPayload): Promise<void> {
		const { participantIdentity, newRole, secret } = event;
		const roomId = this.meetingContext.roomId();
		const local = this.meetingContext.localParticipant();
		const participantName = this.roomMemberService.getParticipantName();

		// Check if the role update is for the local participant
		if (local && participantIdentity === local.identity) {
			if (!secret || !roomId) return;

			// Update room secret in context
			this.meetingContext.setRoomSecret(secret);
			this.sessionStorageService.setRoomSecret(secret);

			try {
				// Refresh participant token with new role
				await this.roomMemberService.generateToken(roomId, {
					secret,
					grantJoinMeetingPermission: true,
					participantName,
					participantIdentity
				});

				// Update local participant role
				local.meetRole = newRole;
				console.log(`You have been assigned the role of ${newRole}`);

				// Increment version to trigger reactivity
				this.meetingContext.incrementParticipantsVersion();
			} catch (error) {
				console.error('Error refreshing room member token:', error);
			}
		} else {
			// Update remote participant role
			const remoteParticipants = this.meetingContext.remoteParticipants();
			const participant = remoteParticipants.find((p) => p.identity === participantIdentity);
			if (participant) {
				participant.meetRole = newRole;

				// Increment version to trigger reactivity
				this.meetingContext.incrementParticipantsVersion();
			}
		}
	}

	/**
	 * Maps technical ParticipantLeftReason to user-friendly LeftEventReason.
	 * This provides better messaging to users about why they left the room.
	 */
	private mapLeftReason(reason: ParticipantLeftReason): LeftEventReason {
		const reasonMap: Record<ParticipantLeftReason, LeftEventReason> = {
			[ParticipantLeftReason.LEAVE]: LeftEventReason.VOLUNTARY_LEAVE,
			[ParticipantLeftReason.BROWSER_UNLOAD]: LeftEventReason.VOLUNTARY_LEAVE,
			[ParticipantLeftReason.NETWORK_DISCONNECT]: LeftEventReason.NETWORK_DISCONNECT,
			[ParticipantLeftReason.SIGNAL_CLOSE]: LeftEventReason.NETWORK_DISCONNECT,
			[ParticipantLeftReason.SERVER_SHUTDOWN]: LeftEventReason.SERVER_SHUTDOWN,
			[ParticipantLeftReason.PARTICIPANT_REMOVED]: LeftEventReason.PARTICIPANT_KICKED,
			[ParticipantLeftReason.ROOM_DELETED]: LeftEventReason.MEETING_ENDED,
			[ParticipantLeftReason.DUPLICATE_IDENTITY]: LeftEventReason.UNKNOWN,
			[ParticipantLeftReason.OTHER]: LeftEventReason.UNKNOWN
		};
		return reasonMap[reason] ?? LeftEventReason.UNKNOWN;
	}
}
