import {
	MeetRecordingInfo,
	MeetWebhookEvent,
	MeetWebhookEventType,
	MeetWebhookPayload,
	WebhookPreferences
} from '@typings-ce';
import crypto from 'crypto';
import { inject, injectable } from 'inversify';
import { Room } from 'livekit-server-sdk';
import { MEET_API_KEY } from '../environment.js';
import { LoggerService, MeetStorageService } from './index.js';

@injectable()
export class OpenViduWebhookService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(MeetStorageService) protected globalPrefService: MeetStorageService
	) {}

	// TODO: Implement Room webhooks
	async sendRoomFinishedWebhook(room: Room) {
		// try {
		// 	await this.sendWebhookEvent(MeetWebhookEventType.ROOM_FINISHED, data);
		// } catch (error) {
		// 	this.logger.error(`Error sending room finished webhook: ${error}`);
		// }
	}

	async sendRecordingStartedWebhook(recordingInfo: MeetRecordingInfo) {
		try {
			await this.sendWebhookEvent(MeetWebhookEventType.RECORDING_STARTED, recordingInfo);
		} catch (error) {
			this.logger.error(`Error sending recording started webhook: ${error}`);
		}
	}

	async sendRecordingUpdatedWebhook(recordingInfo: MeetRecordingInfo) {
		try {
			await this.sendWebhookEvent(MeetWebhookEventType.RECORDING_UPDATED, recordingInfo);
		} catch (error) {
			this.logger.error(`Error sending recording updated webhook: ${error}`);
		}
	}

	async sendRecordingEndedWebhook(recordingInfo: MeetRecordingInfo) {
		try {
			await this.sendWebhookEvent(MeetWebhookEventType.RECORDING_ENDED, recordingInfo);
		} catch (error) {
			this.logger.error(`Error sending recording ended webhook: ${error}`);
		}
	}

	private async sendWebhookEvent(event: MeetWebhookEventType, payload: MeetWebhookPayload) {
		const webhookPreferences = await this.getWebhookPreferences();

		if (!webhookPreferences.enabled) return;

		const creationDate = Date.now();
		const data: MeetWebhookEvent = {
			event,
			creationDate,
			data: payload
		};

		const signature = this.generateWebhookSignature(creationDate, data);

		this.logger.info(`Sending webhook event ${data.event}`);

		try {
			await this.fetchWithRetry(webhookPreferences.url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Timestamp': creationDate.toString(),
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

	private async getWebhookPreferences(): Promise<WebhookPreferences> {
		try {
			const { webhooksPreferences } = await this.globalPrefService.getGlobalPreferences();
			return webhooksPreferences;
		} catch (error) {
			this.logger.error('Error getting webhook preferences:', error);
			throw error;
		}
	}
}
