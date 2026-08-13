import type { MeetWebhook, MeetWebhookOptions } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { uid } from 'uid/single';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { DocumentNotFoundError } from '../models/database.model.js';
import { errorMaxWebhooksReached, errorWebhookNotFound } from '../models/error.model.js';
import { WebhookRepository } from '../repositories/webhook.repository.js';
import { LoggerService } from './logger.service.js';
import { OpenViduWebhookService } from './openvidu-webhook.service.js';

/**
 * Owns the `webhook` resource: the registered endpoints OpenVidu Meet delivers event
 * notifications to, each optionally filtered by event type and scoped to a single room.
 *
 * This service is the CRUD surface only. Delivery (envelope, signature, retries) lives in
 * {@link OpenViduWebhookService}, which reads this collection to fan events out.
 *
 * A webhook's `roomId` is an opaque scope filter: it is not validated against existing rooms, so
 * it can be registered before its room is created, and it simply never matches once the room is
 * gone (the lifecycle-on-room-deletion policy is roadmap open decision #17).
 */
@injectable()
export class WebhookService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(WebhookRepository) protected webhookRepository: WebhookRepository,
		@inject(OpenViduWebhookService) protected openviduWebhookService: OpenViduWebhookService
	) {}

	/**
	 * Registers a new webhook.
	 *
	 * @throws A 409 error when the maximum number of registered webhooks has been reached
	 */
	async createWebhook(options: MeetWebhookOptions): Promise<MeetWebhook> {
		const count = await this.webhookRepository.count();

		if (count >= INTERNAL_CONFIG.WEBHOOK_MAX_ENDPOINTS) {
			throw errorMaxWebhooksReached(INTERNAL_CONFIG.WEBHOOK_MAX_ENDPOINTS);
		}

		const webhook: MeetWebhook = {
			webhookId: `wh-${uid(15)}`,
			url: options.url,
			events: options.events,
			roomId: options.roomId,
			enabled: options.enabled ?? true,
			creationDate: Date.now()
		};

		const createdWebhook = await this.webhookRepository.create(webhook);
		this.logger.info(`Webhook '${createdWebhook.webhookId}' created for URL '${createdWebhook.url}'`);
		return createdWebhook;
	}

	/**
	 * Returns all registered webhooks.
	 */
	getWebhooks(): Promise<MeetWebhook[]> {
		return this.webhookRepository.findAll();
	}

	/**
	 * Returns a webhook by its ID.
	 *
	 * @throws A 404 error when the webhook does not exist
	 */
	async getWebhook(webhookId: string): Promise<MeetWebhook> {
		const webhook = await this.webhookRepository.findById(webhookId);

		if (!webhook) {
			throw errorWebhookNotFound(webhookId);
		}

		return webhook;
	}

	/**
	 * Replaces the definition of a webhook (PUT semantics: an omitted optional field is cleared,
	 * not preserved).
	 *
	 * @throws A 404 error when the webhook does not exist
	 */
	async updateWebhook(webhookId: string, options: MeetWebhookOptions): Promise<MeetWebhook> {
		try {
			const updatedWebhook = await this.webhookRepository.update(webhookId, {
				url: options.url,
				events: options.events,
				roomId: options.roomId,
				enabled: options.enabled ?? true
			});
			this.logger.info(`Webhook '${webhookId}' updated`);
			return updatedWebhook;
		} catch (error) {
			if (error instanceof DocumentNotFoundError) {
				throw errorWebhookNotFound(webhookId);
			}

			throw error;
		}
	}

	/**
	 * Deletes a webhook.
	 *
	 * @throws A 404 error when the webhook does not exist
	 */
	async deleteWebhook(webhookId: string): Promise<void> {
		try {
			await this.webhookRepository.delete(webhookId);
			this.logger.info(`Webhook '${webhookId}' deleted`);
		} catch (error) {
			if (error instanceof DocumentNotFoundError) {
				throw errorWebhookNotFound(webhookId);
			}

			throw error;
		}
	}

	/**
	 * Sends a test event to the stored URL of a webhook.
	 *
	 * @throws A 404 error when the webhook does not exist
	 * @throws A 400 error when the URL is unreachable or answers with an error
	 */
	async testWebhook(webhookId: string): Promise<void> {
		const webhook = await this.getWebhook(webhookId);
		await this.openviduWebhookService.testWebhookUrl(webhook.url);
	}
}
