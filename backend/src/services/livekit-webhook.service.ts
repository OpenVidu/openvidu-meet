import { MeetRecordingInfo, MeetRecordingStatus } from '@typings-ce';
import { inject, injectable } from 'inversify';
import { EgressInfo, ParticipantInfo, Room, WebhookEvent, WebhookReceiver } from 'livekit-server-sdk';
import { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } from '../environment.js';
import { MeetLock, MeetRoomHelper, RecordingHelper } from '../helpers/index.js';
import { DistributedEventType } from '../models/distributed-event.model.js';
import {
	LiveKitService,
	LoggerService,
	MeetStorageService,
	MutexService,
	OpenViduWebhookService,
	RecordingService,
	RoomService,
	DistributedEventService
} from './index.js';
import { FrontendEventService } from './frontend-event.service.js';
import ms from 'ms';

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
			await this.frontendEventService.sendRoomStatusSignalToOpenViduComponents(room.name, participant.sid);
		} catch (error) {
			this.logger.error('Error sending room status signal on participant join:', error);
		}
	}

	/**
	 * Handles a room started event from LiveKit.
	 *
	 * This method retrieves the corresponding meet room from the room service using the LiveKit room name.
	 * If the meet room is found, it sends a webhook notification indicating that the meeting has started.
	 * If the meet room is not found, it logs a warning message.
	 */
	async handleRoomStarted(room: Room) {
		try {
			const meetRoom = await this.roomService.getMeetRoom(room.name);

			if (!meetRoom) {
				this.logger.warn(`Room ${room.name} not found in OpenVidu Meet.`);
				return;
			}

			this.openViduWebhookService.sendMeetingStartedWebhook(meetRoom);
		} catch (error) {
			this.logger.error('Error sending meeting started webhook:', error);
		}
	}

	/**
	 * Handles the event when a room is finished.
	 *
	 * This method sends a webhook notification indicating that the room has finished.
	 * If an error occurs while sending the webhook, it logs the error.
	 *
	 * @param {Room} room - The room object that has finished.
	 * @returns {Promise<void>} A promise that resolves when the webhook has been sent.
	 */
	async handleRoomFinished({ name: roomName }: Room): Promise<void> {
		try {
			const meetRoom = await this.roomService.getMeetRoom(roomName);

			if (!meetRoom) {
				this.logger.warn(`Room ${roomName} not found in OpenVidu Meet.`);
				return;
			}

			this.logger.info(`Processing room_finished event for room: ${roomName}`);

			this.openViduWebhookService.sendMeetingEndedWebhook(meetRoom);

			const tasks = [];

			if (meetRoom.markedForDeletion) {
				// If the room is marked for deletion, we need to delete it
				this.logger.info(`Deleting room ${roomName} after meeting finished because it was marked for deletion`);
				tasks.push(this.roomService.bulkDeleteRooms([roomName], true));
			}

			tasks.push(this.recordingService.releaseRecordingLockIfNoEgress(roomName));
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
			const recordingInfo: MeetRecordingInfo = RecordingHelper.toRecordingInfo(egressInfo);
			const { roomId, recordingId, status } = recordingInfo;

			this.logger.debug(`Recording '${recordingId}' in room '${roomId}' status: '${status}'`);

			// Common tasks for all webhook types
			const commonTasks = [
				this.storageService.saveRecordingMetadata(recordingInfo),
				this.frontendEventService.sendRecordingSignalToOpenViduComponents(roomId, recordingInfo)
			];

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

					break;
				case 'ended':
					specificTasks.push(this.recordingService.releaseRecordingLockIfNoEgress(roomId));
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
