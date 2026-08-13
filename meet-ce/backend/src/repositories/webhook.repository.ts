import type { MeetWebhook } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import type { MeetWebhookDocument, MeetWebhookDocumentOnlyField } from '../models/mongoose-schemas/webhook.schema.js';
import { MEET_WEBHOOK_DOCUMENT_ONLY_FIELDS, MeetWebhookModel } from '../models/mongoose-schemas/webhook.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing MeetWebhook entities in MongoDB.
 */
@injectable()
export class WebhookRepository extends BaseRepository<MeetWebhook, MeetWebhookDocument> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetWebhookModel);
	}

	protected toDomain(dbObject: MeetWebhookDocument): MeetWebhook {
		const { schemaVersion, ...webhook } = dbObject;
		void schemaVersion;
		return webhook;
	}

	protected override getDocumentOnlyFields(): readonly MeetWebhookDocumentOnlyField[] {
		return MEET_WEBHOOK_DOCUMENT_ONLY_FIELDS;
	}

	/**
	 * Creates a new webhook.
	 */
	create(webhook: MeetWebhook): Promise<MeetWebhook> {
		const document: MeetWebhookDocument = {
			...webhook,
			schemaVersion: INTERNAL_CONFIG.WEBHOOK_SCHEMA_VERSION
		};
		return this.createDocument(document);
	}

	/**
	 * Returns all webhooks.
	 */
	findAll(): Promise<MeetWebhook[]> {
		return super.findAll();
	}

	/**
	 * Returns the webhooks that currently receive events. The collection is capped at
	 * `WEBHOOK_MAX_ENDPOINTS`, so reading it whole per delivery stays cheap.
	 */
	findEnabled(): Promise<MeetWebhook[]> {
		return super.findAll({ enabled: true });
	}

	/**
	 * Finds a webhook by its ID, or returns null if it does not exist.
	 */
	findById(webhookId: string): Promise<MeetWebhook | null> {
		return this.findOne({ webhookId });
	}

	/**
	 * Updates the given fields of a webhook. An explicit `undefined` value unsets the field.
	 *
	 * @throws DocumentNotFoundError if the webhook does not exist
	 */
	update(webhookId: string, webhook: Partial<MeetWebhook>): Promise<MeetWebhook> {
		return this.updatePartialOne({ webhookId }, webhook);
	}

	/**
	 * Deletes a webhook by its ID.
	 *
	 * @throws DocumentNotFoundError if the webhook does not exist
	 */
	delete(webhookId: string): Promise<void> {
		return this.deleteOne({ webhookId });
	}

	/**
	 * Counts the registered webhooks.
	 */
	count(): Promise<number> {
		return super.count();
	}
}
