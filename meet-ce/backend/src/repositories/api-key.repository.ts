import { MeetApiKey } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { Require_id } from 'mongoose';
import { MeetApiKeyDocument, MeetApiKeyModel } from '../models/mongoose-schemas/api-key.schema.js';
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

	/**
	 * Creates a new API key.
	 */
	async create(apiKey: MeetApiKey): Promise<MeetApiKey> {
		return this.createDocument(apiKey);
	}

	/**
	 * Returns all API keys.
	 */
	async findAll(): Promise<MeetApiKey[]> {
		return await super.findAll();
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
