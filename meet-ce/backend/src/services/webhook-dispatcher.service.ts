import type {
	MeetApiKey,
	MeetParticipantJoinedPayload,
	MeetParticipantLeftPayload,
	MeetRecordingInfo,
	MeetRoom,
	MeetWebhookEvent,
	MeetWebhookPayload
} from '@openvidu-meet/typings';
import { MeetWebhookEventType } from '@openvidu-meet/typings';
import crypto from 'crypto';
import { inject, injectable } from 'inversify';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { isCompatibilityMode } from '../environment.js';
import { withDeprecatedPermissionAliases } from '../helpers/permission-naming.helper.js';
import { extractWebhookRoomId, webhookMatchesEvent } from '../helpers/webhook.helper.js';
import {
	errorApiKeyNotConfiguredForWebhooks,
	errorInvalidWebhookUrl,
	OpenViduMeetError
} from '../models/error.model.js';
import { WebhookRepository } from '../repositories/webhook.repository.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { ApiKeyService } from './api-key.service.js';
import { LoggerService } from './logger.service.js';

@injectable()
export class WebhookDispatcherService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(WebhookRepository) protected webhookRepository: WebhookRepository,
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
		this.sendWebhookEventInBackground(
			MeetWebhookEventType.MEETING_STARTED,
			this.roomToWirePermissions(room),
			`Room ID: ${room.roomId}`
		);
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
		this.sendWebhookEventInBackground(
			MeetWebhookEventType.MEETING_ENDED,
			this.roomToWirePermissions(room),
			`Room ID: ${room.roomId}`
		);
	}

	/**
	 * Serializes the room's role permissions the same way REST responses do: with
	 * `MEET_MODE=compatibility` the payload carries both key sets (the current names plus the
	 * deprecated `can*` spellings), with `'3.9.0'` only the current names. The compatibility branch
	 * is removed in 3.12.0.
	 */
	protected roomToWirePermissions(room: MeetRoom): MeetRoom {
		if (!isCompatibilityMode() || !room.roles) {
			return room;
		}

		// The compatibility wire shape is wider than the MeetRoomRoles type; the cast is confined to
		// this JSON boundary.
		return {
			...room,
			roles: {
				moderator: { permissions: withDeprecatedPermissionAliases(room.roles.moderator.permissions) },
				speaker: { permissions: withDeprecatedPermissionAliases(room.roles.speaker.permissions) }
			}
		} as unknown as MeetRoom;
	}

	/**
	 * Sends a webhook notification when a participant joins a meeting.
	 *
	 * @param payload - The joined participant's snapshot, plus the room it joined
	 */
	sendParticipantJoinedWebhook(payload: MeetParticipantJoinedPayload) {
		this.sendWebhookEventInBackground(
			MeetWebhookEventType.PARTICIPANT_JOINED,
			payload,
			`Room ID: ${payload.roomId}, Participant: ${payload.participant.participantIdentity}`
		);
	}

	/**
	 * Sends a webhook notification when a participant leaves a meeting.
	 *
	 * @param payload - The departing participant's snapshot, plus the room it left and how long it stayed
	 */
	sendParticipantLeftWebhook(payload: MeetParticipantLeftPayload) {
		this.sendWebhookEventInBackground(
			MeetWebhookEventType.PARTICIPANT_LEFT,
			payload,
			`Room ID: ${payload.roomId}, Participant: ${payload.participant.participantIdentity}`
		);
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
			const body = JSON.stringify(data);
			const signature = await this.generateWebhookSignature(creationDate, body);

			await this.sendTestRequest(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Timestamp': creationDate.toString(),
					'X-Signature': signature
				},
				body
			});
		} catch (error) {
			this.logger.warn(`Error sending test webhook to URL '${url}'`, error);
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
			this.logger.warn(`Background webhook '${event}' failed${contextInfo}`, error);
		});
	}

	/**
	 * Delivers an event to every registered webhook that matches it (enabled, event-type filter,
	 * room scope). The envelope and its signature are computed once and shared: the HMAC secret is
	 * global (the deployment's first API key), so per-endpoint signatures would be identical.
	 *
	 * Deliveries run concurrently and each endpoint retries in isolation: one endpoint being slow or
	 * down never delays or drops the others, and its failure is logged per webhook instead of
	 * rejecting the whole send.
	 */
	protected async sendWebhookEvent(event: MeetWebhookEventType, payload: MeetWebhookPayload) {
		const enabledWebhooks = await this.webhookRepository.findEnabled();
		const roomId = extractWebhookRoomId(payload);
		const webhooks = enabledWebhooks.filter((webhook) => webhookMatchesEvent(webhook, event, roomId));

		if (webhooks.length === 0) return;

		const creationDate = Date.now();
		const data: MeetWebhookEvent = {
			event,
			creationDate,
			data: payload
		};
		const body = JSON.stringify(data);
		const signature = await this.generateWebhookSignature(creationDate, body);

		this.logger.info(`Sending webhook event ${data.event} to ${webhooks.length} endpoint(s)`);

		const requestInit: RequestInit = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Timestamp': creationDate.toString(),
				'X-Signature': signature
			},
			body
		};
		const deliveries = await runConcurrently(webhooks, (webhook) => this.fetchWithRetry(webhook.url, requestInit));

		deliveries.forEach((delivery, index) => {
			if (delivery.status === 'rejected') {
				const { webhookId, url } = webhooks[index];
				this.logger.warn(
					`Webhook event ${data.event} could not be delivered to '${webhookId}' (${url})`,
					delivery.reason
				);
			}
		});
	}

	/**
	 * Signs the serialized event envelope with the global webhook secret (the deployment's first
	 * API key). Takes the payload already serialized so the signed bytes are exactly the bytes sent.
	 */
	protected async generateWebhookSignature(timestamp: number, serializedPayload: string): Promise<string> {
		const apiKey = await this.getApiKey();
		return crypto.createHmac('sha256', apiKey).update(`${timestamp}.${serializedPayload}`).digest('hex');
	}

	protected async fetchWithRetry(
		url: string,
		options: RequestInit,
		retries = INTERNAL_CONFIG.WEBHOOK_RETRY_ATTEMPTS,
		delay = INTERNAL_CONFIG.WEBHOOK_RETRY_INITIAL_DELAY
	): Promise<void> {
		try {
			await this.sendRequest(url, options);
		} catch (error) {
			if (retries <= 0) {
				throw new Error(`Request failed: ${error instanceof Error ? error.message : String(error)}`, {
					cause: error
				});
			}

			this.logger.warn(`Retrying in ${delay / 1000} seconds... (${retries} retries left)`);
			await new Promise((resolve) => setTimeout(resolve, delay));
			// Retry the request after a delay with exponential backoff
			return this.fetchWithRetry(url, options, retries - 1, delay * 2);
		}
	}

	protected async sendRequest(url: string, options: RequestInit): Promise<void> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), INTERNAL_CONFIG.WEBHOOK_REQUEST_TIMEOUT);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`Request failed with status ${response.status}`);
			}
		} catch (error) {
			clearTimeout(timeoutId);

			// Handle timeout error specifically
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(`Request timed out after  seconds`, { cause: error });
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
		const timeoutId = setTimeout(() => controller.abort(), INTERNAL_CONFIG.WEBHOOK_REQUEST_TIMEOUT);

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
			this.logger.verbose(`Webhook test successful for URL: ${url}`);
		} catch (error) {
			clearTimeout(timeoutId);

			// If it's already our webhook error, re-throw it
			if (error instanceof OpenViduMeetError && error.name === 'Webhook Error') {
				throw error;
			}

			// Handle specific error types
			let reason: string;
			const errorName = error instanceof Error ? error.name : '';
			const errorMessage = error instanceof Error ? error.message : String(error);

			if (errorName === 'AbortError') {
				reason = `Request timed out after  seconds`;
			} else if (errorName === 'TypeError' && errorMessage.includes('fetch')) {
				// Network errors
				const errorCode =
					error instanceof Error ? (error.cause as { code?: string } | undefined)?.code : undefined;

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
						reason = `Network error: ${errorMessage}`;
				}
			} else {
				reason = `Connection failed: ${errorMessage}`;
			}

			throw errorInvalidWebhookUrl(url, reason);
		}
	}

	protected async getApiKey(): Promise<string> {
		let apiKeys: MeetApiKey[];

		try {
			apiKeys = await this.apiKeyService.getApiKeys();
		} catch {
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
