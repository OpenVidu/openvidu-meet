import { Injectable, inject } from '@angular/core';
import {
	LeftEventReason,
	MeetParticipantPermissionsUpdatedPayload,
	MeetParticipantRoleUpdatedPayload,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions,
	MeetRoomMemberUIBadge,
	MeetSignalType,
	WebComponentEvent,
	WebComponentOutboundEventMessage
} from '@openvidu-meet/typings';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { NavigationService } from '../../../shared/services/navigation.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { SoundService } from '../../../shared/services/sound.service';
import { RecordingService } from '../../recordings/services/recording.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomFeatureService } from '../../rooms/services/room-feature.service';
import type {
	DataPacket_Kind,
	LocalParticipant,
	ParticipantLeftEvent,
	ParticipantModel,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent,
	RemoteParticipant,
	Room
} from '../openvidu-components';
import { ParticipantLeftReason, RoomEvent } from '../openvidu-components';
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
				const relevantTopics = [
					'recordingStopped',
					MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED,
					MeetSignalType.MEET_PARTICIPANT_PERMISSIONS_UPDATED
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

						case MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED:
							const roleUpdateEvent = event as MeetParticipantRoleUpdatedPayload;
							await this.handleParticipantRoleUpdated(roleUpdateEvent);
							break;

						case MeetSignalType.MEET_PARTICIPANT_PERMISSIONS_UPDATED:
							const permissionsUpdateEvent = event as MeetParticipantPermissionsUpdatedPayload;
							await this.handleParticipantPermissionsUpdated(permissionsUpdateEvent);
							break;
					}
				} catch (error) {
					console.warn(`Failed to parse data message for topic: ${topic}`, error);
				}
			}
		);

		room.on(
			RoomEvent.ParticipantMetadataChanged,
			(_prevMetadata: string | undefined, participant: LocalParticipant | RemoteParticipant) => {
				this.handleParticipantMetadataChanged(participant.identity, participant.metadata);
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

		// Clear room member and meeting context
		this.roomMemberContextService.clearContext();
		this.meetingContext.clearContext();

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
	 * Handles role updated event for the local participant by refreshing the room member token to get updated permissions.
	 * Also shows a notification to the user about their new role.
	 *
	 * @param event Participant role updated event payload
	 */
	private async handleParticipantRoleUpdated(event: MeetParticipantRoleUpdatedPayload): Promise<void> {
		const { roomId, participantIdentity, newBadge } = event;
		const local = this.meetingContext.localParticipant();

		if (!roomId || !local || local.identity !== participantIdentity) {
			return;
		}

		try {
			// Refresh room member token to get updated permissions based on new role
			await this.roomMemberContextService.refreshToken(roomId);

			const isPromotedModerator = newBadge === MeetRoomMemberUIBadge.MODERATOR;
			this.showParticipantRoleUpdatedNotification(isPromotedModerator);
		} catch (error) {
			console.error('Error refreshing room member token after role update:', error);
			await this.navigationService.redirectToErrorPage(NavigationErrorReason.ROOM_ACCESS_REVOKED, true);
		}
	}

	/**
	 * Handles permissions updated event for the local participant by regenerating the room member token to get updated permissions.
	 *
	 * @param event Participant permissions updated event payload
	 */
	private async handleParticipantPermissionsUpdated(event: MeetParticipantPermissionsUpdatedPayload): Promise<void> {
		const { participantIdentity } = event;
		const roomId = this.meetingContext.roomId();
		const local = this.meetingContext.localParticipant();

		if (!roomId || !local || local.identity !== participantIdentity) {
			return;
		}

		try {
			const roomSecret = this.meetingContext.roomSecret();
			const tokenOptions: MeetRoomMemberTokenOptions = {
				secret: roomSecret,
				joinMeeting: true
			};
			await this.roomMemberContextService.generateToken(roomId, tokenOptions);

			this.notificationService.showSnackbar('Your permissions have been updated');
		} catch (error) {
			console.error('Error regenerating room member token after permissions update:', error);
			await this.navigationService.redirectToErrorPage(NavigationErrorReason.ROOM_ACCESS_REVOKED, true);
		}
	}

	/**
	 * Handles LiveKit participant metadata updates to synchronize participant badge and moderation state.
	 * This is necessary to reflect role changes (e.g. promoted to moderator) in the UI based on metadata updates from the backend.
	 *
	 * @param participantIdentity - The identity of the participant whose metadata changed
	 * @param metadata - The new metadata string, expected to be a JSON string containing badge and promotedModerator properties
	 */
	private handleParticipantMetadataChanged(participantIdentity: string, metadata: string | undefined): void {
		const parsedMetadata = this.parseParticipantMetadata(metadata);
		if (!parsedMetadata) {
			return;
		}

		const local = this.meetingContext.localParticipant();
		if (local && local.identity === participantIdentity) {
			local.badge = parsedMetadata.badge;
			local.promotedModerator = Boolean(parsedMetadata.isPromotedModerator);
			return;
		}

		const remoteParticipants = this.meetingContext.remoteParticipants();
		const participant = remoteParticipants.find((p) => p.identity === participantIdentity);
		if (participant) {
			participant.badge = parsedMetadata.badge;
			participant.promotedModerator = Boolean(parsedMetadata.isPromotedModerator);
		}
	}

	private parseParticipantMetadata(metadata: string | undefined): MeetRoomMemberTokenMetadata | undefined {
		if (!metadata) {
			return undefined;
		}

		try {
			const parsed = JSON.parse(metadata) as Partial<MeetRoomMemberTokenMetadata>;
			if (
				!parsed.badge ||
				(parsed.isPromotedModerator !== undefined && typeof parsed.isPromotedModerator !== 'boolean')
			) {
				return undefined;
			}

			return parsed as MeetRoomMemberTokenMetadata;
		} catch (error) {
			console.warn('Failed to parse participant metadata', error);
			return undefined;
		}
	}

	private showParticipantRoleUpdatedNotification(isPromotedModerator: boolean): void {
		const message = isPromotedModerator
			? 'You have been promoted to moderator'
			: 'Your moderator role has been removed';
		this.notificationService.showSnackbar(message);

		if (isPromotedModerator) {
			this.soundService.playParticipantRoleUpgradedSound();
		} else {
			this.soundService.playParticipantRoleDowngradedSound();
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
			[ParticipantLeftReason.DUPLICATE_IDENTITY]: LeftEventReason.DUPLICATE_IDENTITY,
			[ParticipantLeftReason.OTHER]: LeftEventReason.UNKNOWN
		};
		return reasonMap[reason] ?? LeftEventReason.UNKNOWN;
	}
}
