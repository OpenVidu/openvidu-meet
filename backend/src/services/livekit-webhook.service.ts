import { MeetingEndAction, MeetRecordingInfo, MeetRecordingStatus, MeetRoomStatus } from '@typings-ce';
import { inject, injectable } from 'inversify';
import { EgressInfo, ParticipantInfo, Room, WebhookEvent, WebhookReceiver } from 'livekit-server-sdk';
import ms from 'ms';
import { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } from '../environment.js';
import { MeetLock, MeetRoomHelper, RecordingHelper } from '../helpers/index.js';
import { DistributedEventType } from '../models/distributed-event.model.js';
import { FrontendEventService } from './frontend-event.service.js';
import {
	DistributedEventService,
	LiveKitService,
	LoggerService,
	MeetStorageService,
	MutexService,
	OpenViduWebhookService,
	ParticipantService,
	RecordingService,
	RoomService
} from './index.js';

@injectable()
export class LivekitWebhookService {
	protected webhookReceiver: WebhookReceiver;
	constructor(
		@inject(RecordingService) protected recordingService: RecordingService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(MeetStorageService) protected storageService: MeetStorageService,
		@inject(OpenViduWebhookService) protected openViduWebhookService: OpenViduWebhookService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(DistributedEventService) protected distributedEventService: DistributedEventService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(ParticipantService) protected participantService: ParticipantService,
		@inject(LoggerService) protected logger: LoggerService
	) {
		this.webhookReceiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
	}

	/**
	 * Retrieves a WebhookEvent from the provided request body and authentication token.
	 * @param body - The request body containing the webhook data.
	 * @param auth - The authentication token for verifying the webhook request.
	 * @returns The WebhookEvent extracted from the request body.
	 */
	async getEventFromWebhook(body: string, auth?: string): Promise<WebhookEvent | undefined> {
		try {
			const webhookEvent = await this.webhookReceiver.receive(body, auth);
			const lock = await this.mutexService.acquire(MeetLock.getWebhookLock(webhookEvent), ms('5s'));

			if (!lock) return undefined;

			return webhookEvent;
		} catch (error) {
			this.logger.error('Error receiving webhook event', error);
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
		this.logger.debug(`[webhookEventBelongsToOpenViduMeet] Checking webhook event: ${webhookEvent.event}`);

		// Case 1: Check using room object from the event
		if (room) {
			this.logger.debug(`[webhookEventBelongsToOpenViduMeet] Checking room metadata for room: ${room.name}`);

			if (!room.metadata) {
				this.logger.debug(`[webhookEventBelongsToOpenViduMeet] Room metadata is empty for room: ${room.name}`);

				const updatedMetadata = await this.livekitService.getRoomMetadata(room.name);

				if (!updatedMetadata) {
					this.logger.debug(`[webhookEventBelongsToOpenViduMeet] No metadata found for room: ${room.name}`);
				}

				if (MeetRoomHelper.checkIfMeetingBelogsToOpenViduMeet(updatedMetadata)) return true;

				const roomExists = await this.roomService.meetRoomExists(room.name);
				this.logger.debug(
					`[webhookEventBelongsToOpenViduMeet] Room '${room.name}' ${roomExists ? 'exists' : 'does not exist'} in OpenVidu Meet`
				);
				return roomExists;
			}

			this.logger.debug(`[webhookEventBelongsToOpenViduMeet] Room metadata found for room: ${room.name}`);
			return (
				MeetRoomHelper.checkIfMeetingBelogsToOpenViduMeet(room.metadata) ||
				(await this.roomService.meetRoomExists(room.name))
			);
		}

		// Case 2: No room in event - use roomName from egress/ingress info
		const roomName = egressInfo?.roomName ?? ingressInfo?.roomName;

		if (!roomName) {
			this.logger.debug('[webhookEventBelongsToOpenViduMeet] Room name not found in webhook event');
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
	 *
	 * Handles the 'participant_joined' event by gathering relevant room and participant information,
	 * checking room status, and sending a data payload with room status information to the newly joined participant.
	 * @param room - Information about the room where the participant joined.
	 * @param participant - Information about the newly joined participant.
	 */
	async handleParticipantJoined(room: Room, participant: ParticipantInfo) {
		// Skip if the participant is an egress participant
		if (this.livekitService.isEgressParticipant(participant)) return;

		try {
			const { recordings } = await this.recordingService.getAllRecordings({ roomId: room.name });
			await this.frontendEventService.sendRoomStatusSignalToOpenViduComponents(
				room.name,
				participant.sid,
				recordings
			);
		} catch (error) {
			this.logger.error('Error sending room status signal on participant join:', error);
		}
	}

	/**
	 * Handles the 'participant_left' event by releasing the participant's reserved name
	 * to make it available for other participants.
	 * @param room - Information about the room where the participant left.
	 * @param participant - Information about the participant who left.
	 */
	async handleParticipantLeft(room: Room, participant: ParticipantInfo) {
		// Skip if the participant is an egress participant
		if (this.livekitService.isEgressParticipant(participant)) return;

		try {
			// Release the participant's reserved name
			await this.participantService.releaseParticipantName(room.name, participant.name);
			this.logger.verbose(`Released name for participant '${participant.name}' in room '${room.name}'`);
		} catch (error) {
			this.logger.error('Error releasing participant name on participant left:', error);
		}
	}

	/**
	 * Handles a room started event from LiveKit.
	 *
	 * This method retrieves the corresponding meet room from the room service using the LiveKit room name.
	 * If the meet room is found, it updates the room status to ACTIVE_MEETING,
	 * and sends a webhook notification indicating that the meeting has started.
	 *
	 * @param {Room} room - The room object that has started.
	 */
	async handleRoomStarted({ name: roomId }: Room) {
		try {
			const meetRoom = await this.roomService.getMeetRoom(roomId);

			if (!meetRoom) {
				this.logger.warn(`Room '${roomId}' not found in OpenVidu Meet.`);
				return;
			}

			this.logger.info(`Processing room_started event for room: ${roomId}`);

			// Update Meet room status to ACTIVE_MEETING
			meetRoom.status = MeetRoomStatus.ACTIVE_MEETING;
			await this.storageService.saveMeetRoom(meetRoom);

			// Send webhook notification
			this.openViduWebhookService.sendMeetingStartedWebhook(meetRoom);
		} catch (error) {
			this.logger.error('Error handling room started event:', error);
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
	 * and cleans up any resources associated with the room.
	 *
	 * @param {Room} room - The room object that has finished.
	 */
	async handleRoomFinished({ name: roomId }: Room): Promise<void> {
		try {
			const meetRoom = await this.roomService.getMeetRoom(roomId);

			if (!meetRoom) {
				this.logger.warn(`Room '${roomId}' not found in OpenVidu Meet.`);
				return;
			}

			this.logger.info(`Processing room_finished event for room: ${roomId}`);
			const tasks = [];

			switch (meetRoom.meetingEndAction) {
				case MeetingEndAction.DELETE:
					this.logger.info(
						`Deleting room '${roomId}' (and its recordings if any) after meeting finished because it was scheduled to be deleted`
					);
					await this.recordingService.deleteAllRoomRecordings(roomId); // This operation must complete before deleting the room
					tasks.push(this.roomService.bulkDeleteRooms([roomId], true));
					break;
				case MeetingEndAction.CLOSE:
					this.logger.info(
						`Closing room '${roomId}' after meeting finished because it was scheduled to be closed`
					);
					meetRoom.status = MeetRoomStatus.CLOSED;
					meetRoom.meetingEndAction = MeetingEndAction.NONE;
					tasks.push(this.storageService.saveMeetRoom(meetRoom));
					break;
				default:
					// Update Meet room status to OPEN
					meetRoom.status = MeetRoomStatus.OPEN;
					tasks.push(this.storageService.saveMeetRoom(meetRoom));
			}

			// Send webhook notification
			this.openViduWebhookService.sendMeetingEndedWebhook(meetRoom);

			tasks.push(
				this.participantService.cleanupParticipantNames(roomId),
				this.recordingService.releaseRecordingLockIfNoEgress(roomId)
			);
			await Promise.all(tasks);
		} catch (error) {
			this.logger.error(`Error handling room finished event: ${error}`);
		}
	}

	/**
	 * Processes a recording egress event by updating metadata, sending webhook notifications,
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

			// Common tasks for all webhook types
			const commonTasks = [this.storageService.saveRecordingMetadata(recordingInfo)];

			const specificTasks: Promise<unknown>[] = [];

			// Send webhook notification
			switch (webhookAction) {
				case 'started':
					specificTasks.push(
						this.storageService.archiveRoomMetadata(roomId),
						this.storageService.saveAccessRecordingSecrets(recordingId)
					);
					this.openViduWebhookService.sendRecordingStartedWebhook(recordingInfo);
					break;
				case 'updated':
					this.openViduWebhookService.sendRecordingUpdatedWebhook(recordingInfo);

					if (recordingInfo.status === MeetRecordingStatus.ACTIVE) {
						// Send system event for active recording with the aim of cancelling the cleanup timer
						specificTasks.push(
							this.distributedEventService.publishEvent(
								DistributedEventType.RECORDING_ACTIVE,
								recordingInfo as unknown as Record<string, unknown>
							)
						);
					}

					specificTasks.push(
						this.frontendEventService.sendRecordingSignalToOpenViduComponents(roomId, recordingInfo)
					);

					break;
				case 'ended':
					specificTasks.push(
						this.recordingService.releaseRecordingLockIfNoEgress(roomId),
						this.frontendEventService.sendRecordingSignalToOpenViduComponents(roomId, recordingInfo)
					);
					this.openViduWebhookService.sendRecordingEndedWebhook(recordingInfo);
					break;
			}

			// Wait for all promises to resolve
			await Promise.all([...commonTasks, ...specificTasks]);
		} catch (error) {
			this.logger.warn(
				`Error processing recording_${webhookAction} webhook for egress ${egressInfo.egressId}: ${error}`
			);
		}
	}
}
