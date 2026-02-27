import { MeetApiKey } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { Require_id } from 'mongoose';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import {
	MEET_API_KEY_DOCUMENT_ONLY_FIELDS,
	MeetApiKeyDocument,
	MeetApiKeyDocumentOnlyField,
	MeetApiKeyModel
} from '../models/mongoose-schemas/api-key.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing MeetApiKey entities in MongoDB.
 */
@injectable()
export class ApiKeyRepository extends BaseRepository<MeetApiKey, MeetApiKeyDocument> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetApiKeyModel);
	}

	protected toDomain(dbObject: Require_id<MeetApiKeyDocument> & { __v: number }): MeetApiKey {
		const { _id, __v, schemaVersion, ...apiKey } = dbObject;
		(void _id, __v, schemaVersion);
		return apiKey as MeetApiKey;
	}

	protected override getDocumentOnlyFields(): readonly MeetApiKeyDocumentOnlyField[] {
		return MEET_API_KEY_DOCUMENT_ONLY_FIELDS;
	}

	/**
	 * Creates a new API key.
	 */
	async create(apiKey: MeetApiKey): Promise<MeetApiKey> {
		const document: MeetApiKeyDocument = {
			...apiKey,
			schemaVersion: INTERNAL_CONFIG.API_KEY_SCHEMA_VERSION
		};
		return this.createDocument(document);
	}

	/**
	 * Returns all API keys.
	 */
	async findAll(): Promise<MeetApiKey[]> {
		return super.findAll();
	}

	/**
	 * Deletes all API keys from the collection.
	 */
	async deleteAll(): Promise<void> {
		try {
			await this.deleteMany();
			this.logger.verbose('All API keys deleted successfully');
		} catch (error) {
			this.logger.error('Error deleting all API keys:', error);
			throw error;
		}
	}
}
