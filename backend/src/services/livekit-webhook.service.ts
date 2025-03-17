import { inject, injectable } from '../config/dependency-injector.config.js';
import { EgressInfo, ParticipantInfo, Room, SendDataOptions, WebhookEvent, WebhookReceiver } from 'livekit-server-sdk';
import { RecordingHelper } from '../helpers/recording.helper.js';
import { DataTopic } from '../models/signal.model.js';
import { LiveKitService } from './livekit.service.js';
import { RecordingInfo, RecordingStatus } from '@typings-ce';
import { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, MEET_NAME_ID } from '../environment.js';
import { LoggerService } from './logger.service.js';
import { RoomService } from './room.service.js';
import { S3Service } from './s3.service.js';
import { RoomStatusData } from '../models/room.model.js';
import { RecordingService } from './recording.service.js';
import { OpenViduWebhookService } from './openvidu-webhook.service.js';

@injectable()
export class LivekitWebhookService {
	private webhookReceiver: WebhookReceiver;

	constructor(
		@inject(S3Service) protected s3Service: S3Service,
		@inject(RecordingService) protected recordingService: RecordingService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(LoggerService) protected logger: LoggerService,
		@inject(OpenViduWebhookService) protected openViduWebhookService: OpenViduWebhookService
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

	async handleEgressUpdated(egressInfo: EgressInfo) {
		try {
			const isRecording: boolean = RecordingHelper.isRecordingEgress(egressInfo);

			if (!isRecording) return;

			const { roomName } = egressInfo;

			let recordingInfo: RecordingInfo | undefined = undefined;

			this.logger.info(`Recording egress '${egressInfo.egressId}' updated: ${egressInfo.status}`);
			const topic: DataTopic = RecordingHelper.getDataTopicFromStatus(egressInfo);
			recordingInfo = RecordingHelper.toRecordingInfo(egressInfo);

			// Add recording metadata
			const metadataPath = this.generateMetadataPath(recordingInfo);
			const promises = [
				this.s3Service.saveObject(metadataPath, recordingInfo),
				this.roomService.sendSignal(roomName, recordingInfo, { topic })
			];

			if(recordingInfo.status === RecordingStatus.STARTED) {
				promises.push(this.openViduWebhookService.sendRecordingStartedWebhook(recordingInfo));
			}

			await Promise.all(promises);
		} catch (error) {
			this.logger.warn(`Error sending data on egress updated: ${error}`);
		}
	}

	/**
	 * Handles the 'egress_ended' event by gathering relevant room and recording information,
	 * updating the recording metadata, and sending a data payload with recording information to the room.
	 * @param egressInfo - Information about the ended recording egress.
	 */
	async handleEgressEnded(egressInfo: EgressInfo) {
		try {
			const isRecording: boolean = RecordingHelper.isRecordingEgress(egressInfo);

			if (!isRecording) return;

			const { roomName } = egressInfo;
			let payload: RecordingInfo | undefined = undefined;

			const topic: DataTopic = DataTopic.RECORDING_STOPPED;
			payload = RecordingHelper.toRecordingInfo(egressInfo);

			// Update recording metadata
			const metadataPath = this.generateMetadataPath(payload);
			await Promise.all([
				this.s3Service.saveObject(metadataPath, payload),
				this.roomService.sendSignal(roomName, payload, { topic }),
				this.openViduWebhookService.sendRecordingStoppedWebhook(payload)
			]);
		} catch (error) {
			this.logger.warn(`Error sending data on egress ended: ${error}`);
		}
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
			// Do not send status signal to egress participants
			if (this.livekitService.isEgressParticipant(participant)) {
				return;
			}

			await this.sendStatusSignal(room.name, room.sid, participant.sid);
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
	async handleRoomFinished(room: Room) {
		try {
			await this.openViduWebhookService.sendRoomFinishedWebhook(room);
		} catch (error) {
			this.logger.error(`Error handling room finished event: ${error}`);
		}
	}


	private async sendStatusSignal(roomName: string, roomId: string, participantSid: string) {
		// Get recording list
		const recordingInfo = await this.recordingService.getAllRecordingsByRoom(roomName, roomId);

		// Check if recording is started in the room
		const isRecordingStarted = recordingInfo.some((rec) => rec.status === RecordingStatus.STARTED);

		// Construct the payload to send to the participant
		const payload: RoomStatusData = {
			isRecordingStarted,
			recordingList: recordingInfo
		};
		const signalOptions: SendDataOptions = {
			topic: DataTopic.ROOM_STATUS,
			destinationSids: participantSid ? [participantSid] : []
		};
		await this.roomService.sendSignal(roomName, payload, signalOptions);
	}

	private generateMetadataPath(payload: RecordingInfo): string {
		const metadataFilename = `${payload.roomName}-${payload.roomId}`;
		const recordingFilename = payload.filename?.split('.')[0];
		const egressId = payload.id;
		return `.metadata/${metadataFilename}/${recordingFilename}_${egressId}.json`;
	}
}
