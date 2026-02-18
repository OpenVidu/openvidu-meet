import { Injectable, inject } from '@angular/core';
import {
	LeftEventReason,
	MeetParticipantRoleUpdatedPayload,
	MeetRoomMemberRole,
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
import { NavigationService } from '../../../shared/services/navigation.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { SoundService } from '../../../shared/services/sound.service';
import { TokenStorageService } from '../../../shared/services/token-storage.service';
import { RecordingService } from '../../recordings/services/recording.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomFeatureService } from '../../rooms/services/room-feature.service';
import { MeetingContextService } from './meeting-context.service';
import { MeetingWebComponentManagerService } from './meeting-webcomponent-manager.service';

/**
 * Service that handles all LiveKit/OpenVidu room events.
 *
 * This service encapsulates all event handling logic and updates the MeetingContextService
 * as the single source of truth for meeting state.
 */
@Injectable()
export class MeetingEventHandlerService {
	protected meetingContext = inject(MeetingContextService);
	protected roomFeatureService = inject(RoomFeatureService);
	protected recordingService = inject(RecordingService);
	protected roomMemberContextService = inject(RoomMemberContextService);
	protected sessionStorageService = inject(SessionStorageService);
	protected tokenStorageService = inject(TokenStorageService);
	protected wcManagerService = inject(MeetingWebComponentManagerService);
	protected navigationService = inject(NavigationService);
	protected notificationService = inject(NotificationService);
	protected soundService = inject(SoundService);

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
		room.on(
			RoomEvent.DataReceived,
			async (payload: Uint8Array, _participant?: RemoteParticipant, _kind?: DataPacket_Kind, topic?: string) => {
				// Only process topics that this handler is responsible for
				const relevantTopics = ['recordingStopped', MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED];

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

						case MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED:
							const roleUpdateEvent = event as MeetParticipantRoleUpdatedPayload;
							await this.handleParticipantRoleUpdated(roleUpdateEvent);
							this.showParticipantRoleUpdatedNotification(roleUpdateEvent.newRole);
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
	 * - Clears participant identity and token from RoomMemberContextService
	 * - Navigates to disconnected page
	 *
	 * @param event Participant left event from OpenVidu
	 */
	onParticipantLeft = async (event: ParticipantLeftEvent): Promise<void> => {
		let leftReason = this.mapLeftReason(event.reason);

		// If meeting was ended by local user, update reason
		const meetingEndedBySelf = this.meetingContext.meetingEndedBy() === 'self';
		if (leftReason === LeftEventReason.MEETING_ENDED && meetingEndedBySelf) {
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
		this.roomMemberContextService.clearContext();

		// Navigate to disconnected page
		await this.navigationService.navigateTo('/disconnected', { reason: leftReason }, true);
	};

	/**
	 * Handles recording start request event.
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
	 * Handles participant role updated event.
	 * Updates local or remote participant role and refreshes room member token if needed.
	 * Obtains all necessary data from MeetingContextService.
	 */
	private async handleParticipantRoleUpdated(event: MeetParticipantRoleUpdatedPayload): Promise<void> {
		const { participantIdentity, newRole, secret } = event;
		const roomId = this.meetingContext.roomId();
		const local = this.meetingContext.localParticipant();
		const participantName = this.roomMemberContextService.participantName();

		// Check if the role update is for the local participant
		if (local && participantIdentity === local.identity) {
			if (!secret || !roomId) return;

			// Update room secret in context (without updating session storage)
			this.meetingContext.setRoomSecret(secret);

			try {
				// Refresh participant token with new role
				await this.roomMemberContextService.generateToken(roomId, {
					secret,
					joinMeeting: true,
					participantName,
					participantIdentity
				});

				// Update local participant role
				local.meetRole = newRole;
				console.log(`You have been assigned the role of ${newRole}`);
			} catch (error) {
				console.error('Error refreshing room member token:', error);
			}
		} else {
			// Update remote participant role
			const remoteParticipants = this.meetingContext.remoteParticipants();
			const participant = remoteParticipants.find((p) => p.identity === participantIdentity);
			if (participant) {
				participant.meetRole = newRole;
			}
		}
	}

	private showParticipantRoleUpdatedNotification(newRole: MeetRoomMemberRole): void {
		this.notificationService.showSnackbar(`You have been assigned the role of ${newRole.toUpperCase()}`);
		newRole === MeetRoomMemberRole.MODERATOR
			? this.soundService.playParticipantRoleUpgradedSound()
			: this.soundService.playParticipantRoleDowngradedSound();
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
