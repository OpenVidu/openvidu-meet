import {
	MeetRecordingInfo,
	MeetRoom,
	MeetWebhookEvent,
	MeetWebhookEventType,
	MeetWebhookPayload,
	WebhookPreferences
} from '@typings-ce';
import crypto from 'crypto';
import { inject, injectable } from 'inversify';
import { MEET_INITIAL_API_KEY } from '../environment.js';
import { AuthService, LoggerService, MeetStorageService } from './index.js';
import { errorWebhookUrlUnreachable } from '../models/error.model.js';

@injectable()
export class OpenViduWebhookService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(MeetStorageService) protected globalPrefService: MeetStorageService,
		@inject(AuthService) protected authService: AuthService
	) {}

	/**
	 * Sends a webhook notification when a meeting has started.
	 *
	 * This method triggers a background webhook event to notify external systems
	 * that a meeting session has begun for the specified room.
	 *
	 * @param room - The meeting room object containing room details
	 */
	sendMeetingStartedWebhook(room: MeetRoom) {
		this.sendWebhookEventInBackground(MeetWebhookEventType.MEETING_STARTED, room, `Room ID: ${room.roomId}`);
	}

	/**
	 * Sends a webhook notification when a meeting has ended.
	 *
	 * This method triggers a background webhook event to notify external systems
	 * that a meeting session has concluded for the specified room.
	 *
	 * @param room - The MeetRoom object containing details of the ended meeting
	 */
	sendMeetingEndedWebhook(room: MeetRoom) {
		this.sendWebhookEventInBackground(MeetWebhookEventType.MEETING_ENDED, room, `Room ID: ${room.roomId}`);
	}

	/**
	 * Sends a webhook event notification when a recording has started.
	 *
	 * This method triggers a background webhook event to notify external systems
	 * that a meeting recording has been initiated.
	 *
	 * @param recordingInfo - The recording information containing details about the started recording
	 */
	sendRecordingUpdatedWebhook(recordingInfo: MeetRecordingInfo) {
		this.sendWebhookEventInBackground(
			MeetWebhookEventType.RECORDING_UPDATED,
			recordingInfo,
			`Recording ID: ${recordingInfo.recordingId}`
		);
	}

	/**
	 * Sends a webhook notification when a recording has started.
	 *
	 * This method triggers a background webhook event to notify external services
	 * that a meeting recording has begun. The webhook includes the recording
	 * information and uses the recording ID for identification purposes.
	 *
	 * @param recordingInfo - The recording information containing details about the started recording
	 */
	sendRecordingStartedWebhook(recordingInfo: MeetRecordingInfo) {
		this.sendWebhookEventInBackground(
			MeetWebhookEventType.RECORDING_STARTED,
			recordingInfo,
			`Recording ID: ${recordingInfo.recordingId}`
		);
	}

	/**
	 * Sends a webhook notification when a recording has ended.
	 *
	 * This method triggers a background webhook event to notify external systems
	 * that a meeting recording has completed.
	 *
	 * @param recordingInfo - The recording information containing details about the ended recording
	 */
	sendRecordingEndedWebhook(recordingInfo: MeetRecordingInfo) {
		this.sendWebhookEventInBackground(
			MeetWebhookEventType.RECORDING_ENDED,
			recordingInfo,
			`Recording ID: ${recordingInfo.recordingId}`
		);
	}

	/**
	 * Tests a webhook URL by sending a test event to it.
	 *
	 * This method sends a test event to the specified webhook URL to verify if it is reachable and functioning correctly.
	 * If the request fails, it throws an error indicating that the webhook URL is unreachable.
	 *
	 * @param url - The webhook URL to test
	 */
	async testWebhookUrl(url: string) {
		const creationDate = Date.now();
		const data = {
			event: 'testEvent',
			creationDate,
			data: {
				message: 'This is a test webhook event'
			}
		};

		try {
			await this.sendRequest(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(data)
			});
		} catch (error) {
			this.logger.error(`Error testing webhook URL ${url}: ${error}`);
			throw errorWebhookUrlUnreachable(url);
		}
	}

	/**
	 * Sends a webhook event asynchronously in the background without blocking the main execution flow.
	 * If the webhook fails, logs a warning message with the error details and optional context information.
	 *
	 * @param event - The type of webhook event to send
	 * @param payload - The data payload to include with the webhook event
	 * @param context - Optional context string to include in error messages for debugging purposes
	 */
	protected sendWebhookEventInBackground(
		event: MeetWebhookEventType,
		payload: MeetWebhookPayload,
		context?: string
	): void {
		this.sendWebhookEvent(event, payload).catch((error) => {
			const contextInfo = context ? ` (${context})` : '';
			this.logger.warn(`Background webhook ${event} failed${contextInfo}: ${error}`);
		});
	}

	protected async sendWebhookEvent(event: MeetWebhookEventType, payload: MeetWebhookPayload) {
		const webhookPreferences = await this.getWebhookPreferences();

		if (!webhookPreferences.enabled) return;

		const creationDate = Date.now();
		const data: MeetWebhookEvent = {
			event,
			creationDate,
			data: payload
		};

		this.logger.info(`Sending webhook event ${data.event}`);

		try {
			const signature = await this.generateWebhookSignature(creationDate, data);

			await this.fetchWithRetry(webhookPreferences.url!, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Timestamp': creationDate.toString(),
					'X-Signature': signature
				},
				body: JSON.stringify(data)
			});
		} catch (error) {
			this.logger.error(`Error sending webhook event ${data.event} to '${webhookPreferences.url}':`, error);
			throw error;
		}
	}

	protected async generateWebhookSignature(timestamp: number, payload: object): Promise<string> {
		const apiKey = await this.getApiKey();
		return crypto
			.createHmac('sha256', apiKey)
			.update(`${timestamp}.${JSON.stringify(payload)}`)
			.digest('hex');
	}

	protected async fetchWithRetry(url: string, options: RequestInit, retries = 5, delay = 300): Promise<void> {
		try {
			await this.sendRequest(url, options);
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

	protected async sendRequest(url: string, options: RequestInit): Promise<void> {
		const response = await fetch(url, options);

		if (!response.ok) {
			throw new Error(`Request failed with status ${response.status}`);
		}
	}

	protected async getWebhookPreferences(): Promise<WebhookPreferences> {
		try {
			const { webhooksPreferences } = await this.globalPrefService.getGlobalPreferences();
			return webhooksPreferences;
		} catch (error) {
			this.logger.error('Error getting webhook preferences:', error);
			throw error;
		}
	}

	protected async getApiKey(): Promise<string> {
		const apiKeys = await this.authService.getApiKeys();

		if (apiKeys.length === 0) {
			// If no API keys are configured, check if the MEET_API_KEY environment variable is set
			if (MEET_INITIAL_API_KEY) {
				return MEET_INITIAL_API_KEY;
			}

			throw new Error('There are no API keys configured yet. Please, create one to use webhooks.');
		}

		// Return the first API key
		return apiKeys[0].key;
	}
}
