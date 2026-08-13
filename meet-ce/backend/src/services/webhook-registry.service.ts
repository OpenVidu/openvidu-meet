import type { MeetWebhook, MeetWebhookOptions } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { uid } from 'uid/single';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { MeetLock } from '../helpers/redis.helper.js';
import { DocumentNotFoundError } from '../models/database.model.js';
import { errorMaxWebhooksReached, errorWebhookNotFound } from '../models/error.model.js';
import { MeetGlobalConfigModel } from '../models/mongoose-schemas/global-config.schema.js';
import { WebhookRepository } from '../repositories/webhook.repository.js';
import { LoggerService } from './logger.service.js';
import { MutexService } from './mutex.service.js';
import { WebhookDispatcherService } from './webhook-dispatcher.service.js';

/**
 * Owns the `webhook` resource: the registered endpoints OpenVidu Meet delivers event
 * notifications to, each optionally filtered by event type and scoped to a single room.
 *
 * This service is the CRUD surface only. Delivery (envelope, signature, retries) lives in
 * {@link WebhookDispatcherService}, which reads this collection to fan events out.
 *
 * A webhook's `roomId` is an opaque scope filter: it is not validated against existing rooms, so
 * it can be registered before its room is created, and it simply never matches once the room is
 * gone (the lifecycle-on-room-deletion policy is roadmap open decision #17).
 */
@injectable()
export class WebhookRegistryService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(WebhookRepository) protected webhookRepository: WebhookRepository,
		@inject(WebhookDispatcherService) protected webhookDispatcherService: WebhookDispatcherService,
		@inject(MutexService) protected mutexService: MutexService
	) {}

	/**
	 * Registers the webhook a fresh deployment is configured to start with
	 * (`MEET_INITIAL_WEBHOOK_ENABLED` / `MEET_INITIAL_WEBHOOK_URL`). Called by storage
	 * initialization, so it only ever runs on a deployment whose storage is empty.
	 *
	 * The entry starts enabled only when an initial API key is also configured: the HMAC signature
	 * secret is the deployment's first API key, so without one every delivery would fail.
	 */
	async initializeDefaultWebhook(): Promise<void> {
		if (!MEET_ENV.INITIAL_WEBHOOK_URL) {
			return;
		}

		const webhook = await this.createWebhook({
			url: MEET_ENV.INITIAL_WEBHOOK_URL,
			enabled: MEET_ENV.INITIAL_WEBHOOK_ENABLED === 'true' && !!MEET_ENV.INITIAL_API_KEY
		});
		this.logger.info(`Initial webhook '${webhook.webhookId}' registered from environment configuration`);
	}

	/**
	 * One-shot upgrade step: moves the single webhook URL that used to live in the global config
	 * (`webhooksConfig.url`) into this collection as the deployment's first entry, so delivery has
	 * exactly one source of truth. It must run before the schema migrations, which remove the
	 * legacy field from the global config document.
	 *
	 * The URL field is cleared in the same step, which is what makes the move final: once cleared,
	 * nothing is ever copied again, so deleting the webhook later cannot resurrect it on the next
	 * boot. The entry is only created while the collection is empty — a non-empty collection with
	 * the URL still present can only be a crash between the copy and the clearing, where the copy
	 * already happened.
	 *
	 * The document is read and written through the native driver: the schema no longer needs to
	 * declare the legacy field for this step to find it.
	 */
	async migrateLegacyWebhookConfig(): Promise<void> {
		const lockKey = MeetLock.getWebhookConfigMigrationLock();
		const executed = await this.mutexService.withLock(lockKey, ms('30s'), async () => {
			// The global config is a single-document collection, so the empty filter is the document
			const collection = MeetGlobalConfigModel.collection;
			const rawConfig = await collection.findOne<{
				webhooksConfig?: { enabled?: boolean; url?: string };
			}>({});
			const legacyConfig = rawConfig?.webhooksConfig;

			if (!legacyConfig?.url) {
				return;
			}

			const count = await this.webhookRepository.count();

			if (count === 0) {
				const webhook = await this.createWebhook({
					url: legacyConfig.url,
					enabled: legacyConfig.enabled ?? false
				});
				this.logger.info(
					`Legacy webhook config migrated to webhook '${webhook.webhookId}' (URL: '${legacyConfig.url}')`
				);
			} else {
				this.logger.warn(
					'Legacy webhook config URL found with webhooks already registered; clearing it without copying'
				);
			}

			await collection.updateOne({}, { $unset: { 'webhooksConfig.url': '' } });
		});

		if (executed === null) {
			this.logger.verbose('Legacy webhook config migration is being handled by another instance');
		}
	}

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
		await this.webhookDispatcherService.testWebhookUrl(webhook.url);
	}
}
