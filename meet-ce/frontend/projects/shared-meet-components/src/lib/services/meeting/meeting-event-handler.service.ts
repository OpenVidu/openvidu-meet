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
	NavigationService,
	RecordingService,
	RoomMemberService,
	RoomService,
	SessionStorageService,
	TokenStorageService,
	WebComponentManagerService
} from '../../services';

/**
 * Service that handles all LiveKit/OpenVidu room events.
 *
 * This service encapsulates all event handling logic previously in MeetingComponent,
 * providing a clean separation of concerns and making the component more maintainable.
 *
 * Responsibilities:
 * - Setup and manage room event listeners
 * - Handle data received events (recording stopped, config updates, role changes)
 * - Handle participant lifecycle events (connected, left)
 * - Handle recording events (start, stop)
 * - Map technical reasons to user-friendly reasons
 * - Manage meeting ended state
 * - Navigate to disconnected page with appropriate reason
 *
 * Benefits:
 * - Reduces MeetingComponent size by ~200 lines
 * - All event logic in one place (easier to test and maintain)
 * - Clear API for event handling
 * - Reusable across different components if needed
 */
@Injectable()
export class MeetingEventHandlerService {
	// Injected services
	protected featureConfService = inject(FeatureConfigurationService);
	protected recordingService = inject(RecordingService);
	protected roomMemberService = inject(RoomMemberService);
	protected roomService = inject(RoomService);
	protected sessionStorageService = inject(SessionStorageService);
	protected tokenStorageService = inject(TokenStorageService);
	protected wcManagerService = inject(WebComponentManagerService);
	protected navigationService = inject(NavigationService);

	// Internal state
	private meetingEndedByMe = false;

	// ============================================
	// PUBLIC METHODS - Room Event Handlers
	// ============================================

	/**
	 * Sets up all room event listeners when room is created.
	 * This is the main entry point for room event handling.
	 *
	 * @param room The LiveKit Room instance
	 * @param context Context object containing all necessary data and callbacks
	 */
	setupRoomListeners(
		room: Room,
		context: {
			roomId: string;
			roomSecret: string;
			participantName: string;
			localParticipant: () => CustomParticipantModel | undefined;
			remoteParticipants: () => CustomParticipantModel[];
			onHasRecordingsChanged: (hasRecordings: boolean) => void;
			onRoomSecretChanged: (secret: string) => void;
			onParticipantRoleUpdated?: () => void;
		}
	): void {
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
							// Notify that recordings are now available
							context.onHasRecordingsChanged(true);
							break;

						case MeetSignalType.MEET_ROOM_CONFIG_UPDATED:
							await this.handleRoomConfigUpdated(event, context.roomId, context.roomSecret);
							break;

						case MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED:
							await this.handleParticipantRoleUpdated(
								event,
								context.roomId,
								context.participantName,
								context.localParticipant,
								context.remoteParticipants,
								context.onRoomSecretChanged,
								context.onParticipantRoleUpdated
							);
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
		if (leftReason === LeftEventReason.MEETING_ENDED && this.meetingEndedByMe) {
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

	/**
	 * Sets the "meeting ended by me" flag.
	 * This is used to differentiate between meeting ended by this user vs ended by someone else.
	 *
	 * @param value True if this user ended the meeting
	 */
	setMeetingEndedByMe(value: boolean): void {
		this.meetingEndedByMe = value;
	}

	// ============================================
	// PRIVATE METHODS - Event Handlers
	// ============================================

	/**
	 * Handles room config updated event.
	 * Updates feature config and refreshes room member token if needed.
	 */
	private async handleRoomConfigUpdated(
		event: MeetRoomConfigUpdatedPayload,
		roomId: string,
		roomSecret: string
	): Promise<void> {
		const { config } = event;

		// Update feature configuration
		this.featureConfService.setRoomConfig(config);

		// Refresh room member token if recording is enabled
		if (config.recording.enabled) {
			try {
				const participantName = this.roomMemberService.getParticipantName();
				const participantIdentity = this.roomMemberService.getParticipantIdentity();
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
	 */
	private async handleParticipantRoleUpdated(
		event: MeetParticipantRoleUpdatedPayload,
		roomId: string,
		participantName: string,
		localParticipant: () => CustomParticipantModel | undefined,
		remoteParticipants: () => CustomParticipantModel[],
		onRoomSecretChanged: (secret: string) => void,
		onParticipantRoleUpdated?: () => void
	): Promise<void> {
		const { participantIdentity, newRole, secret } = event;
		const local = localParticipant();

		// Check if the role update is for the local participant
		if (local && participantIdentity === local.identity) {
			if (!secret) return;

			// Update room secret
			onRoomSecretChanged(secret);
			this.roomService.setRoomSecret(secret, false);

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

				// Notify component that participant role was updated
				onParticipantRoleUpdated?.();
			} catch (error) {
				console.error('Error refreshing room member token:', error);
			}
		} else {
			// Update remote participant role
			const participant = remoteParticipants().find((p) => p.identity === participantIdentity);
			if (participant) {
				participant.meetRole = newRole;

				// Notify component that participant role was updated
				onParticipantRoleUpdated?.();
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
