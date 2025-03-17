import crypto from 'crypto';
import { inject, injectable } from '../config/dependency-injector.config.js';
import { Room } from 'livekit-server-sdk';
import { LoggerService } from './logger.service.js';
import { MEET_API_KEY, MEET_WEBHOOK_ENABLED, MEET_WEBHOOK_URL } from '../environment.js';
import { OpenViduWebhookEvent, OpenViduWebhookEventType } from '@typings-ce';
import { RecordingInfo } from '../models/recording.model.js';

@injectable()
export class OpenViduWebhookService {
	constructor(@inject(LoggerService) protected logger: LoggerService) {}

	async sendRoomFinishedWebhook(room: Room) {
		const data: OpenViduWebhookEvent = {
			event: OpenViduWebhookEventType.ROOM_FINISHED,
			creationDate: Date.now(),
			data: {
				roomName: room.name
			}
		};
		await this.sendWebhookEvent(data);
	}

	async sendRecordingStartedWebhook(recordingInfo: RecordingInfo) {
		const data: OpenViduWebhookEvent = {
			event: OpenViduWebhookEventType.RECORDING_STARTED,
			creationDate: Date.now(),
			data: {
				recordingId: recordingInfo.id,
				filename: recordingInfo.filename,
				roomName: recordingInfo.roomName,
				status: recordingInfo.status
			}
		};
		await this.sendWebhookEvent(data);
	}

	async sendRecordingStoppedWebhook(recordingInfo: RecordingInfo) {
		const data: OpenViduWebhookEvent = {
			event: OpenViduWebhookEventType.RECORDING_STOPPED,
			creationDate: Date.now(),
			data: {
				recordingId: recordingInfo.id,
				filename: recordingInfo.filename,
				roomName: recordingInfo.roomName,
				status: recordingInfo.status
			}
		};
		await this.sendWebhookEvent(data);
	}

	private async sendWebhookEvent(data: OpenViduWebhookEvent) {
		if (!this.isWebhookEnabled()) return;

		const timestamp = data.creationDate;
		const signature = this.generateWebhookSignature(timestamp, data);

		this.logger.info(`Sending webhook event ${data.event}`);

		try {
			await this.fetchWithRetry(MEET_WEBHOOK_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Timestamp': timestamp.toString(),
					'X-Signature': signature
				},
				body: JSON.stringify(data)
			});
		} catch (error) {
			this.logger.error(`Error sending webhook event ${data.event}: ${error}`);
			throw error;
		}
	}

	private generateWebhookSignature(timestamp: number, payload: object): string {
		return crypto
			.createHmac('sha256', MEET_API_KEY)
			.update(`${timestamp}.${JSON.stringify(payload)}`)
			.digest('hex');
	}

	private async fetchWithRetry(url: string, options: RequestInit, retries = 5, delay = 300): Promise<void> {
		try {
			const response = await fetch(url, options);

			if (!response.ok) {
				throw new Error(`Request failed with status ${response.status}`);
			}
		} catch (error) {
			if (retries <= 0) {
				throw new Error(`Request failed: ${error}`);
			}

			this.logger.warn(`Retrying in ${delay / 1000} seconds... (${retries} retries left)`);
			await new Promise((resolve) => setTimeout(resolve, delay));
			// Retry the request after a delay with exponential backoff
			return this.fetchWithRetry(url, options, retries - 1, delay * 2);
		}
	}

	private isWebhookEnabled(): boolean {
		return !!MEET_WEBHOOK_URL && MEET_WEBHOOK_ENABLED === 'true';
	}
}
