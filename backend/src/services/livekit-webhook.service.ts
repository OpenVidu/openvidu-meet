import { inject, injectable } from '../config/dependency-injector.config.js';
import { EgressInfo, ParticipantInfo, Room, WebhookEvent, WebhookReceiver } from 'livekit-server-sdk';
import { RecordingHelper } from '../helpers/recording.helper.js';
import { LiveKitService } from './livekit.service.js';
import { MeetRecordingInfo, MeetRecordingStatus } from '@typings-ce';
import { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, MEET_NAME_ID } from '../environment.js';
import { LoggerService } from './logger.service.js';
import { RoomService } from './room.service.js';
import { S3Service } from './s3.service.js';
import { RecordingService } from './recording.service.js';
import { OpenViduWebhookService } from './openvidu-webhook.service.js';
import { MutexService } from './mutex.service.js';
import { SystemEventService } from './system-event.service.js';
import { SystemEventType } from '../models/system-event.model.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import INTERNAL_CONFIG from '../config/internal-config.js';

@injectable()
export class LivekitWebhookService {
	protected webhookReceiver: WebhookReceiver;
	constructor(
		@inject(S3Service) protected s3Service: S3Service,
		@inject(RecordingService) protected recordingService: RecordingService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(RoomService) protected roomService: RoomService,
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
	 * !KNOWN ISSUE: Room metadata may be empty when track_publish and track_unpublish events are received.
	 * This does not affect OpenVidu Meet but is a limitation of the LiveKit server.
	 *
	 * We prioritize using the `room` object from the webhook if available.
	 * Otherwise, fallback to the extracted `roomName`.
	 */
	async webhookEventBelongsToOpenViduMeet(webhookEvent: WebhookEvent): Promise<boolean> {
		// Extract relevant properties from the webhook event
		const { room, egressInfo, ingressInfo } = webhookEvent;

		if (room) {
			// Check update room  if webhook is not room_destroyed
			const metadata = room.metadata ? JSON.parse(room.metadata) : {};
			return metadata?.createdBy === MEET_NAME_ID;
		}

		// Get room from roomName
		try {
			// Determine the room name from available sources
			const roomName = egressInfo?.roomName ?? ingressInfo?.roomName ?? '';

			if (!roomName) {
				this.logger.debug('Room name not found in webhook event');
				return false;
			}

			const roomExists = await this.livekitService.roomExists(roomName);

			if (!roomExists) {
				this.logger.debug(`Room ${roomName} not found or no longer exists.`);
				return false;
			}

			// Fetch the room information from LiveKit
			const livekitRoom = await this.livekitService.getRoom(roomName);

			// Parse metadata safely, defaulting to an empty object if null/undefined
			const metadata = livekitRoom.metadata ? JSON.parse(livekitRoom.metadata) : {};
			return metadata?.createdBy === MEET_NAME_ID;
		} catch (error) {
			this.logger.error('Error checking if room was created by OpenVidu Meet:' + String(error));
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
	 * Handles the event when a room is finished.
	 *
	 * This method sends a webhook notification indicating that the room has finished.
	 * If an error occurs while sending the webhook, it logs the error.
	 *
	 * @param {Room} room - The room object that has finished.
	 * @returns {Promise<void>} A promise that resolves when the webhook has been sent.
	 */
	async handleMeetingFinished(room: Room): Promise<void> {
		try {
			const [meetRoom] = await Promise.all([
				this.roomService.getMeetRoom(room.name),
				this.recordingService.releaseRoomRecordingActiveLock(room.name),
				this.openViduWebhookService.sendRoomFinishedWebhook(room)
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
		const metadataPath = this.buildMetadataFilePath(recordingId);

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
				tasks.push(this.openViduWebhookService.sendRecordingStartedWebhook(recordingInfo));
				break;
			case 'updated':
				tasks.push(this.openViduWebhookService.sendRecordingUpdatedWebhook(recordingInfo));

				if (recordingInfo.status === MeetRecordingStatus.ACTIVE) {
					// Send system event for active recording with the aim of cancelling the cleanup timer
					tasks.push(
						this.systemEventService.publishEvent(SystemEventType.RECORDING_ACTIVE, {
							roomId,
							recordingId
						})
					);
				}

				break;
			case 'ended':
				tasks.push(
					this.saveRoomSecretsFileIfNeeded(roomId),
					this.openViduWebhookService.sendRecordingEndedWebhook(recordingInfo),
					this.recordingService.releaseRoomRecordingActiveLock(roomId)
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

	/**
	 * Saves room secrets to an S3 bucket if they haven't been saved already.
	 *
	 * This method checks if secrets for the specified room exist in the S3 storage.
	 * If they don't exist, it retrieves the room information, extracts the publisher
	 * and moderator secrets, and saves them to an S3 bucket under the path
	 * `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.metadata/${roomId}/secrets.json`.
	 */
	protected async saveRoomSecretsFileIfNeeded(roomId: string): Promise<void> {
		try {
			const filePath = `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.metadata/${roomId}/secrets.json`;
			const fileExists = await this.s3Service.exists(filePath);

			if (fileExists) {
				this.logger.debug(`Room secrets already saved for room ${roomId}`);
				return;
			}

			const room = await this.roomService.getMeetRoom(roomId);

			if (room) {
				const { publisherSecret, moderatorSecret } = MeetRoomHelper.extractSecretsFromRoom(room);
				const secrets = {
					publisherSecret,
					moderatorSecret
				};
				await this.s3Service.saveObject(filePath, secrets);
				this.logger.debug(`Room secrets saved for room ${roomId}`);
			}
		} catch (error) {
			this.logger.error(`Error saving room secrets for room ${roomId}: ${error}`);
		}
	}

	protected buildMetadataFilePath(recordingId: string): string {
		const { roomId, egressId, uid } = RecordingHelper.extractInfoFromRecordingId(recordingId);

		return `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.metadata/${roomId}/${egressId}/${uid}.json`;
	}
}
