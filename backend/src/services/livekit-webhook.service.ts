import { inject, injectable } from '../config/dependency-injector.config.js';
import { EgressInfo, ParticipantInfo, Room, WebhookEvent, WebhookReceiver } from 'livekit-server-sdk';
import { RecordingHelper } from '../helpers/recording.helper.js';
import { LiveKitService } from './livekit.service.js';
import { MeetRecordingInfo } from '@typings-ce';
import { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, MEET_NAME_ID, MEET_S3_RECORDINGS_PREFIX } from '../environment.js';
import { LoggerService } from './logger.service.js';
import { RoomService } from './room.service.js';
import { S3Service } from './s3.service.js';
import { RecordingService } from './recording.service.js';
import { OpenViduWebhookService } from './openvidu-webhook.service.js';
import { MutexService } from './mutex.service.js';

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
		return await this.webhookReceiver.receive(body, auth);
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

			const livekitRoom = await this.livekitService.getRoom(roomName);

			if (!livekitRoom) {
				this.logger.debug(`Room ${roomName} not found or no longer exists.`);
				return false;
			}

			// Parse metadata safely, defaulting to an empty object if null/undefined
			const metadata = livekitRoom.metadata ? JSON.parse(livekitRoom.metadata) : {};
			return metadata?.createdBy === MEET_NAME_ID;
		} catch (error) {
			this.logger.error('Error checking if room was created by OpenVidu Meet:' + String(error));
			return false;
		}
	}

	async handleEgressStarted(egressInfo: EgressInfo) {
		await this.processRecordingEgress(egressInfo, 'started');
	}

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
		try {
			// Skip if the participant is an egress participant
			if (this.livekitService.isEgressParticipant(participant)) {
				return;
			}

			await this.roomService.sendRoomStatusSignalToOpenViduComponents(room.name, participant.sid);
		} catch (error) {
			this.logger.error(`Error sending data on participant joined: ${error}`);
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
	async handleMeetingFinished(room: Room) {
		try {
			await this.openViduWebhookService.sendRoomFinishedWebhook(room);
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

		this.logger.debug(`Processing recording ${webhookAction} webhook.`);

		const recordingInfo: MeetRecordingInfo = RecordingHelper.toRecordingInfo(egressInfo);
		const { roomId, recordingId, status } = recordingInfo;
		const metadataPath = this.generateMetadataPath(recordingId);

		this.logger.debug(`Recording '${recordingId}' for room '${roomId}' is in status '${status}'`);

		const promises: Promise<unknown>[] = [];

		try {
			// Update recording metadata
			promises.push(
				this.s3Service.saveObject(metadataPath, recordingInfo),
				this.recordingService.sendRecordingSignalToOpenViduComponents(roomId, recordingInfo)
			);

			// Send webhook notification
			switch (webhookAction) {
				case 'started':
					promises.push(this.openViduWebhookService.sendRecordingStartedWebhook(recordingInfo));
					break;
				case 'updated':
					promises.push(this.openViduWebhookService.sendRecordingUpdatedWebhook(recordingInfo));
					break;
				case 'ended':
					promises.push(
						this.openViduWebhookService.sendRecordingEndedWebhook(recordingInfo),
						this.recordingService.releaseRoomRecordingActiveLock(roomId)
					);
					break;
			}

			// Wait for all promises to resolve
			await Promise.all(promises);
		} catch (error) {
			this.logger.warn(
				`Error sending recording ${webhookAction} webhook for egress ${egressInfo.egressId}: ${error}`
			);
		}
	}

	protected generateMetadataPath(recordingId: string): string {
		const { roomId, egressId, uid } = RecordingHelper.extractInfoFromRecordingId(recordingId);

		return `${MEET_S3_RECORDINGS_PREFIX}/.metadata/${roomId}/${egressId}/${uid}.json`;
	}
}
