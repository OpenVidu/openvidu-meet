import type { MeetRecordingInfo } from '@openvidu-meet/typings';
import { MeetingEndAction, MeetMeetingEndedCause, MeetRecordingStatus, MeetRoomStatus } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { EgressInfo, ParticipantInfo, Room, WebhookEvent } from 'livekit-server-sdk';
import { WebhookReceiver } from 'livekit-server-sdk';
import { container } from '../config/dependency-injector.config.js';
import { MEET_ENV } from '../environment.js';
import { MeetParticipantHelper } from '../helpers/participant.helper.js';
import { RecordingHelper } from '../helpers/recording.helper.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { DistributedEventType } from '../models/distributed-event.model.js';
import { RedisKeyName } from '../models/redis.model.js';
import { RecordingRepository } from '../repositories/recording.repository.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { AiAssistantService } from './ai-assistant.service.js';
import { DistributedEventService } from './distributed-event.service.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { MeetingPresenceService } from './meeting-presence.service.js';
import { RecordingService } from './recording.service.js';
import { RedisService } from './redis.service.js';
import { RoomMemberService } from './room-member.service.js';
import type { RoomScheduledTasksService } from './room-scheduled-tasks.service.js';
import { RoomService } from './room.service.js';
import { TokenService } from './token.service.js';
import { WebhookDispatcherService } from './webhook-dispatcher.service.js';

@injectable()
export class LivekitWebhookService {
	protected webhookReceiver: WebhookReceiver;
	constructor(
		@inject(RecordingService) protected recordingService: RecordingService,
		@inject(RecordingRepository) protected recordingRepository: RecordingRepository,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(WebhookDispatcherService) protected webhookDispatcherService: WebhookDispatcherService,
		@inject(DistributedEventService) protected distributedEventService: DistributedEventService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(RoomMemberService) protected roomMemberService: RoomMemberService,
		@inject(MeetingPresenceService) protected meetingPresenceService: MeetingPresenceService,
		@inject(RoomMemberRepository) protected roomMemberRepository: RoomMemberRepository,
		@inject(AiAssistantService) protected aiAssistantService: AiAssistantService,
		@inject(TokenService) protected tokenService: TokenService,
		@inject(RedisService) protected redisService: RedisService,
		@inject(LoggerService) protected logger: LoggerService
	) {
		this.webhookReceiver = new WebhookReceiver(MEET_ENV.LIVEKIT_API_KEY, MEET_ENV.LIVEKIT_API_SECRET);
	}

	/**
	 * Resolved on use rather than injected: RoomScheduledTasksService injects this service for its
	 * reconcile paths, so a constructor dependency back would be a cycle.
	 */
	protected async getRoomScheduledTasksService(): Promise<RoomScheduledTasksService> {
		const { RoomScheduledTasksService } = await import('./room-scheduled-tasks.service.js');
		return container.get(RoomScheduledTasksService);
	}

	/**
	 * Retrieves a WebhookEvent from the provided request body and authentication token.
	 * @param body - The request body containing the webhook data.
	 * @param auth - The authentication token for verifying the webhook request.
	 * @returns The WebhookEvent extracted from the request body.
	 */
	async getEventFromWebhook(body: string, auth?: string): Promise<WebhookEvent> {
		try {
			return await this.webhookReceiver.receive(body, auth);
		} catch (error) {
			this.logger.warn('Error receiving webhook event', error);
			throw error;
		}
	}

	/**
	 * Checks if the webhook event belongs to OpenVidu Meet.
	 * Uses a systematic approach to verify through different sources.
	 * !KNOWN ISSUE: Room metadata may be empty when track_publish and track_unpublish events are received.
	 */
	async webhookEventBelongsToOpenViduMeet(webhookEvent: WebhookEvent): Promise<boolean> {
		// Extract relevant properties from the webhook event
		const { room, egressInfo, ingressInfo } = webhookEvent;
		this.logger.debug(`Checking if webhook event '${webhookEvent.event}' belongs to OpenVidu Meet`);

		// Case 1: Check using room object from the event
		if (room) {
			if (!room.metadata) {
				const updatedMetadata = await this.livekitService.getRoomMetadata(room.name);

				if (MeetRoomHelper.checkIfMeetingBelogsToOpenViduMeet(updatedMetadata)) return true;

				const roomExists = await this.roomService.meetRoomExists(room.name);
				this.logger.debug(`Room '${room.name}' ${roomExists ? 'exists' : 'does not exist'} in OpenVidu Meet`);
				return roomExists;
			}

			const belongToOpenViduMeet = MeetRoomHelper.checkIfMeetingBelogsToOpenViduMeet(room.metadata);

			if (!belongToOpenViduMeet) {
				return false;
			}

			const roomExists = await this.roomService.meetRoomExists(room.name);

			if (!roomExists) {
				return false;
			}

			return true;
		}

		// Case 2: No room in event - use roomName from egress/ingress info
		const roomName = egressInfo?.roomName ?? ingressInfo?.roomName;

		if (!roomName) {
			this.logger.debug('Room name not found in webhook event');
			return false;
		}

		const updatedMetadata = await this.livekitService.getRoomMetadata(roomName);

		if (MeetRoomHelper.checkIfMeetingBelogsToOpenViduMeet(updatedMetadata)) return true;

		return await this.roomService.meetRoomExists(roomName);
	}

	/**
	 * Handles the 'room_created' event by sending a webhook notification indicating that the room has been created.
	 * If an error occurs while sending the webhook, it logs the error.
	 * @param room - Information about the room that was created.
	 */
	async handleEgressStarted(egressInfo: EgressInfo) {
		await this.processRecordingEgress(egressInfo, 'started');
	}

	/**
	 * Handles the 'egress_updated' event by gathering relevant room and recording information,
	 * updating the recording metadata, and sending a data payload with recording information to the room.
	 * @param egressInfo - Information about the updated recording egress.
	 */
	async handleEgressUpdated(egressInfo: EgressInfo) {
		await this.processRecordingEgress(egressInfo, 'updated');
	}

	/**
	 * Handles the 'egress_ended' event by gathering relevant room and recording information,
	 * updating the recording metadata, and sending a data payload with recording information to the room.
	 * @param egressInfo - Information about the ended recording egress.
	 */
	async handleEgressEnded(egressInfo: EgressInfo) {
		await this.processRecordingEgress(egressInfo, 'ended');
	}

	/**
	 * Handles the 'participant_joined' event by gathering relevant room and participant information,
	 * and syncing the active recording state to the new participant when needed.
	 * @param room - Information about the room where the participant joined.
	 * @param participant - Information about the newly joined participant.
	 */
	async handleParticipantJoined(room: Room, participant: ParticipantInfo) {
		// Skip if the participant is not a standard participant
		if (!this.livekitService.isStandardParticipant(participant)) return;

		// The room's recording may be configured to start by itself.
		void this.recordingService.startAutoRecordingIfNeeded(room, participant);

		try {
			const payload = await MeetParticipantHelper.toParticipantJoinedPayload(room, participant);
			this.webhookDispatcherService.sendParticipantJoinedWebhook(payload);

			const userId = this.getUserIdFromParticipant(participant);

			if (userId) {
				await this.meetingPresenceService.upsertUserInRoom(userId, room.name, participant.identity);
			}

			const { recordings } = await this.recordingService.getAllRecordings({
				roomId: room.name,
				status: MeetRecordingStatus.ACTIVE
			});

			if (recordings.length > 0) {
				await this.frontendEventService.sendRecordingUpdatedSignal(room.name, recordings[0], participant.sid);
			}
		} catch (error) {
			this.logger.error(
				`Error sending recording state on participant join for room '${room.name}' and participant '${participant.identity}'`,
				error
			);
		}
	}

	/**
	 * Handles the 'participant_left' event by gathering relevant room and participant information,
	 * and releasing any reserved participant names.
	 * @param room - Information about the room where the participant left.
	 * @param participant - Information about the participant who left.
	 */
	async handleParticipantLeft(room: Room, participant: ParticipantInfo) {
		// Skip if the participant is not a standard participant
		if (!this.livekitService.isStandardParticipant(participant)) return;

		try {
			const payload = await MeetParticipantHelper.toParticipantLeftPayload(room, participant, Date.now());
			this.webhookDispatcherService.sendParticipantLeftWebhook(payload);

			const userId = this.getUserIdFromParticipant(participant);

			if (userId) {
				await this.meetingPresenceService.removeUserFromRoom(userId, room.name);
			}

			await Promise.all([
				this.roomMemberService.releaseParticipantName(room.name, participant.name),
				this.aiAssistantService.cleanupState(room.name, participant.identity)
			]);
			this.logger.verbose(`Released name for participant '${participant.name}' in room '${room.name}'`);
		} catch (error) {
			this.logger.error(
				`Error releasing participant name on participant left for room '${room.name}' and participant '${participant.name}'`,
				error
			);
		}
	}

	/**
	 * Handles a room started event from LiveKit.
	 *
	 * A closed room is left closed and its LiveKit room deleted instead of reactivated: a still-valid
	 * room-member token can make LiveKit auto-create it again on a raw reconnect, bypassing Meet's own
	 * closed-room check. Otherwise, arms the timer that ends the meeting at its room's duration limit
	 * (when the room declares one), updates the room status to ACTIVE_MEETING and sends a webhook
	 * notification indicating that the meeting has started.
	 *
	 * @param {Room} room - The room object that has started.
	 */
	async handleRoomStarted(room: Room) {
		const { name: roomId, sid: meetingId } = room;

		try {
			this.logger.info(`Processing room_started event for room '${roomId}'`);

			const { status, config } = await this.roomService.getMeetRoom(roomId, ['status', 'config']);

			if (status === MeetRoomStatus.CLOSED) {
				this.logger.warn(
					`Room '${roomId}' is closed in OpenVidu Meet but LiveKit started a new meeting '${meetingId}' in it, ` +
						`most likely a stale room-member token reconnecting straight to LiveKit. Deleting the resurrected LiveKit room instead of reopening the meeting.`
				);
				await this.livekitService.deleteRoom(roomId);
				return;
			}

			if (config.maxDurationMinutes) {
				const roomScheduledTasksService = await this.getRoomScheduledTasksService();
				roomScheduledTasksService.scheduleMeetingMaxDurationEnd(room, config.maxDurationMinutes);
			}

			// Update Meet room status to ACTIVE_MEETING
			const updatedRoom = await this.roomRepository.updatePartial(roomId, {
				status: MeetRoomStatus.ACTIVE_MEETING
			});

			// Send webhook notification
			this.webhookDispatcherService.sendMeetingStartedWebhook(updatedRoom);
		} catch (error) {
			this.logger.error(`Error handling room started event for room '${roomId}'`, error);
		}
	}

	/**
	 * Handles a room finished event from LiveKit.
	 *
	 * This method retrieves the corresponding meet room from the room service using the LiveKit room name.
	 * If the meet room is found, it processes the room based on its meeting end action:
	 *
	 * - If the action is DELETE, it deletes the room and all associated recordings.
	 * - If the action is CLOSE, it closes the room without deleting it.
	 * - If the action is NONE, it simply updates the room status to OPEN.
	 *
	 * Then, it sends a webhook notification indicating that the meeting has ended,
	 * and cleans up any resources associated with the room, the meeting's duration-limit timer
	 * included.
	 *
	 * @param {Room} room - The room object that has finished.
	 */
	async handleRoomFinished({ name: roomId, sid: meetingId }: Room): Promise<void> {
		try {
			// Reactivate the recording auto-start before anything else
			await this.recordingService.reactivateAutoRecording(roomId, meetingId);

			const roomScheduledTasksService = await this.getRoomScheduledTasksService();
			roomScheduledTasksService.cancelMeetingMaxDurationEnd(roomId);

			const meetRoom = await this.roomService.getMeetRoom(roomId);

			this.logger.info(`Processing room_finished event for room '${roomId}'`);
			const tasks = [];

			switch (meetRoom.meetingEndAction) {
				case MeetingEndAction.DELETE:
					this.logger.info(
						`Deleting room '${roomId}' (and its recordings if any) after meeting finished because it was scheduled to be deleted`
					);
					tasks.push(
						this.recordingService.deleteAllRoomRecordings(roomId),
						this.roomMemberRepository.deleteAllByRoomId(roomId),
						this.roomRepository.deleteByRoomId(roomId)
					);
					break;
				case MeetingEndAction.CLOSE:
					this.logger.info(
						`Closing room '${roomId}' after meeting finished because it was scheduled to be closed`
					);
					meetRoom.status = MeetRoomStatus.CLOSED;
					meetRoom.meetingEndAction = MeetingEndAction.NONE;
					tasks.push(
						this.roomRepository.updatePartial(roomId, {
							status: MeetRoomStatus.CLOSED,
							meetingEndAction: MeetingEndAction.NONE
						})
					);
					break;
				default:
					// Update Meet room status to OPEN
					meetRoom.status = MeetRoomStatus.OPEN;
					tasks.push(this.roomRepository.updatePartial(roomId, { status: MeetRoomStatus.OPEN }));
			}

			// Send webhook notification, attributing the end to the duration GC when that's what
			// actually force-ended this meeting (see RoomScheduledTasksService.markMeetingEndedByDurationLimit).
			const cause = await this.getMeetingEndedCause(roomId, meetingId);
			this.webhookDispatcherService.sendMeetingEndedWebhook(meetRoom, cause);

			tasks.push(
				this.meetingPresenceService.removeRoomFromAllUsers(roomId),
				this.roomMemberService.cleanupParticipantNames(roomId),
				this.recordingService.releaseRecordingLockIfNoEgress(roomId),
				this.aiAssistantService.cleanupState(roomId)
			);
			await Promise.all(tasks);
		} catch (error) {
			this.logger.error(`Error handling room finished event for room '${roomId}'`, error);
		}
	}

	/**
	 * Whether `meetingId` was force-ended by the duration GC rather than ending normally (a
	 * moderator's own end, or the room emptying out). Scoped to the meeting's sid — like
	 * {@link RecordingAutoStartStateService#isDisabled}, a flag left over from a different, earlier
	 * meeting in the same room never applies here.
	 */
	protected async getMeetingEndedCause(
		roomId: string,
		meetingId: string
	): Promise<MeetMeetingEndedCause | undefined> {
		const key = `${RedisKeyName.MEETING_ENDED_CAUSE}${roomId}`;
		const value = await this.redisService.get(key);

		return value === meetingId ? MeetMeetingEndedCause.MAX_DURATION_REACHED : undefined;
	}

	/**
	 * Processes a recording egress event by updating metadata in MongoDB, sending webhook notifications,
	 * and performing necessary cleanup actions based on the webhook action type.
	 *
	 * @param egressInfo - The information about the egress event to process.
	 * @param webhookAction - The type of webhook action to handle. Can be 'started', 'updated', or 'ended'.
	 * @returns A promise that resolves when all processing tasks are completed.
	 */
	protected async processRecordingEgress(
		egressInfo: EgressInfo,
		webhookAction: 'started' | 'updated' | 'ended'
	): Promise<void> {
		if (!RecordingHelper.isRecordingEgress(egressInfo)) return;

		this.logger.debug(`Processing recording_${webhookAction} webhook for egress: ${egressInfo.egressId}.`);

		try {
			const recordingInfo: MeetRecordingInfo = await RecordingHelper.toRecordingInfo(egressInfo);
			const { roomId, recordingId, status } = recordingInfo;

			this.logger.debug(`Recording '${recordingId}' in room '${roomId}' status: '${status}'`);

			// Common task for all webhook types: save/update recording metadata in MongoDB
			let recordingTask: Promise<unknown>;

			if (webhookAction === 'started') {
				// Create new recording with auto-generated access secrets
				recordingTask = this.recordingRepository.create(recordingInfo);
			} else {
				// Update existing recording
				recordingTask = this.recordingRepository.replace(recordingInfo);
			}

			const commonTasks = [recordingTask];
			const specificTasks: Promise<unknown>[] = [];

			// Send webhook notification
			switch (webhookAction) {
				case 'started':
					this.webhookDispatcherService.sendRecordingStartedWebhook(recordingInfo);
					break;
				case 'updated':
					this.webhookDispatcherService.sendRecordingUpdatedWebhook(recordingInfo);

					if (recordingInfo.status === MeetRecordingStatus.ACTIVE) {
						// Send system event for active recording with the aim of cancelling the cleanup timer
						specificTasks.push(
							this.distributedEventService.publishEvent(
								DistributedEventType.RECORDING_ACTIVE,
								recordingInfo as unknown as Record<string, unknown>
							)
						);
					}

					specificTasks.push(this.frontendEventService.sendRecordingUpdatedSignal(roomId, recordingInfo));

					break;
				case 'ended':
					specificTasks.push(
						this.recordingService.releaseRecordingLockIfNoEgress(roomId),
						this.frontendEventService.sendRecordingUpdatedSignal(roomId, recordingInfo)
					);
					this.webhookDispatcherService.sendRecordingEndedWebhook(recordingInfo);
					break;
			}

			// Wait for all promises to resolve
			await Promise.all([...commonTasks, ...specificTasks]);
		} catch (error) {
			this.logger.error(
				`Error processing recording_${webhookAction} webhook for egress '${egressInfo.egressId}'`,
				error
			);
		}
	}

	/**
	 * Extracts the user ID from a LiveKit participant's metadata.
	 *
	 * @param participant - The LiveKit participant from which to extract the user ID.
	 * @returns The user ID if it can be extracted, or undefined if it cannot be determined.
	 */
	protected getUserIdFromParticipant(participant: ParticipantInfo): string | undefined {
		if (!participant.metadata) {
			return undefined;
		}

		try {
			const tokenMetadata = this.tokenService.parseRoomMemberTokenMetadata(participant.metadata);
			return tokenMetadata.userId;
		} catch {
			return undefined;
		}
	}
}
