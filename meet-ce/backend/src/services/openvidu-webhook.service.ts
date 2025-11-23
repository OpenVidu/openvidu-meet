import {
	MeetApiKey,
	MeetRecordingInfo,
	MeetRoom,
	MeetWebhookEvent,
	MeetWebhookEventType,
	MeetWebhookPayload
} from '@openvidu-meet/typings';
import crypto from 'crypto';
import { inject, injectable } from 'inversify';
import {
	errorApiKeyNotConfiguredForWebhooks,
	errorInvalidWebhookUrl,
	OpenViduMeetError
} from '../models/error.model.js';
import { ApiKeyService } from './api-key.service.js';
import { GlobalConfigService } from './global-config.service.js';
import { LoggerService } from './logger.service.js';

@injectable()
export class OpenViduWebhookService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(GlobalConfigService) protected configService: GlobalConfigService,
		@inject(ApiKeyService) protected apiKeyService: ApiKeyService
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
			const signature = await this.generateWebhookSignature(creationDate, data);

			await this.sendTestRequest(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Timestamp': creationDate.toString(),
					'X-Signature': signature
				},
				body: JSON.stringify(data)
			});
		} catch (error) {
			this.logger.error(`Error sending test webhook to URL '${url}': ${error}`);
			throw error;
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
		const webhookConfig = await this.configService.getWebhookConfig();

		if (!webhookConfig.enabled) return;

		const creationDate = Date.now();
		const data: MeetWebhookEvent = {
			event,
			creationDate,
			data: payload
		};

		this.logger.info(`Sending webhook event ${data.event}`);

		try {
			const signature = await this.generateWebhookSignature(creationDate, data);

			await this.fetchWithRetry(webhookConfig.url!, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Timestamp': creationDate.toString(),
					'X-Signature': signature
				},
				body: JSON.stringify(data)
			});
		} catch (error) {
			this.logger.error(`Error sending webhook event ${data.event} to '${webhookConfig.url}':`, error);
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
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`Request failed with status ${response.status}`);
			}
		} catch (error: any) {
			clearTimeout(timeoutId);

			// Handle timeout error specifically
			if (error.name === 'AbortError') {
				throw new Error('Request timed out after 5 seconds');
			}

			// Re-throw other errors
			throw error;
		}
	}

	/**
	 * Sends a test request to a webhook URL with specific error handling for testing purposes.
	 *
	 * @param url - The webhook URL to test
	 * @param options - Request options
	 */
	protected async sendTestRequest(url: string, options: RequestInit): Promise<void> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const reason =
					response.status >= 500
						? `Server error (${response.status} ${response.statusText})`
						: response.status >= 400
							? `Client error (${response.status} ${response.statusText})`
							: `Unexpected response (${response.status})`;

				throw errorInvalidWebhookUrl(url, reason);
			}

			// Success case
			this.logger.info(`Webhook test successful for URL: ${url}`);
		} catch (error: any) {
			clearTimeout(timeoutId);

			// If it's already our webhook error, re-throw it
			if (error instanceof OpenViduMeetError && error.name === 'Webhook Error') {
				throw error;
			}

			// Handle specific error types
			let reason: string;

			if (error.name === 'AbortError') {
				reason = 'Request timed out after 5 seconds';
			} else if (error.name === 'TypeError' && error.message.includes('fetch')) {
				// Network errors
				const errorCode = error.cause?.code;

				switch (errorCode) {
					case 'ENOTFOUND':
						reason = 'Domain name could not be resolved';
						break;
					case 'ECONNREFUSED':
						reason = 'Connection refused by server';
						break;
					case 'ECONNRESET':
						reason = 'Connection reset by server';
						break;
					case 'CERT_HAS_EXPIRED':
					case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
					case 'SELF_SIGNED_CERT_IN_CHAIN':
						reason = 'SSL/TLS certificate error';
						break;
					default:
						reason = `Network error: ${error.message}`;
				}
			} else {
				reason = `Connection failed: ${error.message}`;
			}

			throw errorInvalidWebhookUrl(url, reason);
		}
	}

	protected async getApiKey(): Promise<string> {
		let apiKeys: MeetApiKey[];

		try {
			apiKeys = await this.apiKeyService.getApiKeys();
		} catch (error) {
			// If there is an error retrieving API keys, we assume they are not configured
			apiKeys = [];
		}

		if (apiKeys.length === 0) {
			throw errorApiKeyNotConfiguredForWebhooks();
		}

		// Return the first API key
		return apiKeys[0].key;
	}
}
