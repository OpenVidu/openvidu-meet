import { inject, injectable } from 'inversify';
import { LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME } from '../models/migration.model.js';
import { MeetGlobalConfigModel } from '../models/mongoose-schemas/global-config.schema.js';
import { MeetWebhookOptionsSchema } from '../models/zod-schemas/webhook.schema.js';
import { MigrationRepository } from '../repositories/migration.repository.js';
import { WebhookRepository } from '../repositories/webhook.repository.js';
import { LoggerService } from '../services/logger.service.js';
import { WebhookRegistryService } from '../services/webhook-registry.service.js';

/**
 * Data migration for MeetWebhook: moves the single webhook URL that used to live in the global
 * config (`webhooksConfig.url`) into the webhook collection, so delivery has one source of truth.
 *
 * It writes to a different collection than it reads and needs service logic, so it is an injectable
 * class instead of a `SchemaTransform` — see "Two categories of migration" in this folder's README.
 */
@injectable()
export class WebhookMigration {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(WebhookRegistryService) protected webhookRegistryService: WebhookRegistryService,
		@inject(WebhookRepository) protected webhookRepository: WebhookRepository,
		@inject(MigrationRepository) protected migrationRepository: MigrationRepository
	) {}

	/**
	 * Called by `MigrationService.runMigrations()`, before the schema migrations, which remove the
	 * legacy field from the global config document. Assumes the caller already holds the migration
	 * lock — it does not acquire one itself.
	 *
	 * Clearing the URL is what makes the move final — nothing is ever copied twice, so deleting the
	 * webhook later cannot resurrect it on the next boot. That state, not the tracking record, is
	 * the gate: a deployment with nothing to migrate is never recorded.
	 */
	async run(): Promise<void> {
		// The global config is a single-document collection, so the empty filter is the document.
		// Read through the native driver: the schema no longer declares the legacy field.
		const collection = MeetGlobalConfigModel.collection;
		const rawConfig = await collection.findOne<{
			webhooksConfig?: { enabled?: boolean; url?: string };
		}>({});
		const legacyConfig = rawConfig?.webhooksConfig;

		if (!legacyConfig?.url) {
			return;
		}

		if (await this.migrationRepository.isCompleted(LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME)) {
			this.logger.warn(
				`Migration ${LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME} is marked as completed but the legacy URL is ` +
					'still present. Re-running migration.'
			);
		}

		await this.migrationRepository.markAsStarted(LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME);
		const startedAt = Date.now();

		try {
			const count = await this.webhookRepository.count();
			let migratedWebhookId: string | undefined;
			// Same schema POST /webhooks enforces: reused here because this path calls
			// WebhookRegistryService.createWebhook directly, bypassing that validation
			const options = MeetWebhookOptionsSchema.safeParse({
				url: legacyConfig.url,
				enabled: legacyConfig.enabled ?? false
			});

			if (!options.success) {
				// Not retried: the URL is cleared below regardless, so a bad value would otherwise
				// fail the same way on every future boot
				this.logger.error(
					`Legacy webhook config URL '${legacyConfig.url}' is invalid (${options.error.issues.map((issue) => issue.message).join(', ')}); clearing it without copying`
				);
			} else if (count === 0) {
				const webhook = await this.webhookRegistryService.createWebhook(options.data);
				migratedWebhookId = webhook.webhookId;
				this.logger.info(
					`Legacy webhook config migrated to webhook '${webhook.webhookId}' (URL: '${legacyConfig.url}')`
				);
			} else {
				// A non-empty collection with the URL still present can only be a crash between the
				// copy and the clearing, where the copy already happened
				this.logger.warn(
					'Legacy webhook config URL found with webhooks already registered; clearing it without copying'
				);
			}

			await collection.updateOne({}, { $unset: { 'webhooksConfig.url': '' } });

			await this.migrationRepository.markAsCompleted(LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME, {
				url: legacyConfig.url,
				enabled: legacyConfig.enabled ?? false,
				copied: migratedWebhookId !== undefined,
				webhookId: migratedWebhookId,
				existingWebhooks: count,
				invalidUrl: !options.success,
				durationMs: Date.now() - startedAt
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			await this.migrationRepository.markAsFailed(LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME, errorMessage);
			throw error;
		}
	}
}
