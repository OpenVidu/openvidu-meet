import { MeetRecordingInfo, MeetRecordingStatus } from '@typings-ce';
import { inject, injectable } from 'inversify';
import { EgressInfo, ParticipantInfo, Room, WebhookEvent, WebhookReceiver } from 'livekit-server-sdk';
import { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, MEET_NAME_ID } from '../environment.js';
import { RecordingHelper } from '../helpers/index.js';
import { SystemEventType } from '../models/system-event.model.js';
import {
	LiveKitService,
	LoggerService,
	MeetStorageService,
	MutexService,
	OpenViduWebhookService,
	RecordingService,
	RoomService,
	S3Service,
	SystemEventService
} from './index.js';

@injectable()
export class LivekitWebhookService {
	protected webhookReceiver: WebhookReceiver;
	constructor(
		@inject(S3Service) protected s3Service: S3Service,
		@inject(RecordingService) protected recordingService: RecordingService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(MeetStorageService) protected storageService: MeetStorageService,
		@inject(OpenViduWebhookService) protected openViduWebhookService: OpenViduWebhookService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(SystemEventService) protected systemEventService: SystemEventService,
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
	async getEventFromWebhook(body: string, auth?: string): Promise<WebhookEvent> {
		try {
			return await this.webhookReceiver.receive(body, auth);
		} catch (error) {
			this.logger.error('Error receiving webhook event', error);
			throw error;
		}
	}

	/**
	 * Checks if the webhook event belongs to OpenVidu Meet by verifying if the room exist in Opnevidu Meet.
	 */
	async webhookEventBelongsToOpenViduMeet(webhookEvent: WebhookEvent): Promise<boolean> {
		// Extract relevant properties from the webhook event
		const { room, egressInfo, ingressInfo } = webhookEvent;

		// Determine the room name from room object or egress/ingress info
		const roomName = room?.name ?? egressInfo?.roomName ?? ingressInfo?.roomName;

		if (!roomName) {
			this.logger.debug('Room name not found in webhook event');
			return false;
		}

		try {
			const meetRoom = await this.roomService.getMeetRoom(roomName);

			if (!meetRoom) {
				this.logger.debug(`Room ${roomName} not found in OpenVidu Meet.`);
				return false;
			}

			return true;
		} catch (error) {
			this.logger.error(`Error checking if room ${roomName} was created by OpenVidu Meet:`, error);
			return false;
		}
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
			await this.roomService.sendRoomStatusSignalToOpenViduComponents(room.name, participant.sid);
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

			await this.openViduWebhookService.sendMeetingStartedWebhook(meetRoom);
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
	async handleRoomFinished(room: Room): Promise<void> {
		try {
			const meetRoom = await this.roomService.getMeetRoom(room.name);

			if (!meetRoom) {
				this.logger.warn(`Room ${room.name} not found in OpenVidu Meet.`);
				return;
			}

			await Promise.all([
				this.recordingService.releaseRecordingLockIfNoEgress(room.name),
				this.openViduWebhookService.sendMeetingEndedWebhook(meetRoom)
			]);

			if (meetRoom.markedForDeletion) {
				// If the room is marked for deletion, we need to delete it
				this.logger.info(
					`Deleting room ${room.name} after meeting finished because it was marked for deletion`
				);
				this.roomService.bulkDeleteRooms([room.name], true);
			}
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

		this.logger.debug(`Handling recording_${webhookAction} webhook.`);

		const recordingInfo: MeetRecordingInfo = RecordingHelper.toRecordingInfo(egressInfo);
		const { roomId, recordingId, status } = recordingInfo;
		const metadataPath = RecordingHelper.buildMetadataFilePath(recordingId);

		this.logger.debug(`Recording '${recordingId}' status: '${status}'`);

		const tasks: Promise<unknown>[] = [];

		// Update recording metadata
		tasks.push(
			this.s3Service.saveObject(metadataPath, recordingInfo),
			this.recordingService.sendRecordingSignalToOpenViduComponents(roomId, recordingInfo)
		);

		// Send webhook notification
		switch (webhookAction) {
			case 'started':
				tasks.push(
					this.storageService.archiveRoomMetadata(roomId),
					this.openViduWebhookService.sendRecordingStartedWebhook(recordingInfo)
				);
				break;
			case 'updated':
				tasks.push(this.openViduWebhookService.sendRecordingUpdatedWebhook(recordingInfo));

				if (recordingInfo.status === MeetRecordingStatus.ACTIVE) {
					// Send system event for active recording with the aim of cancelling the cleanup timer
					tasks.push(
						this.systemEventService.publishEvent(
							SystemEventType.RECORDING_ACTIVE,
							recordingInfo as unknown as Record<string, unknown>
						)
					);
				}

				break;
			case 'ended':
				tasks.push(
					this.openViduWebhookService.sendRecordingEndedWebhook(recordingInfo),
					this.recordingService.releaseRecordingLockIfNoEgress(roomId)
				);
				break;
		}

		try {
			// Wait for all promises to resolve
			await Promise.all(tasks);
		} catch (error) {
			this.logger.warn(
				`Error processing recording ${webhookAction} webhook for egress ${egressInfo.egressId}: ${error}`
			);
		}
	}
}
