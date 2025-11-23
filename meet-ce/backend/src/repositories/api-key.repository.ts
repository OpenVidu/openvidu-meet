import { MeetApiKey } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MeetApiKeyDocument, MeetApiKeyModel } from '../models/mongoose-schemas/api-key.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing MeetApiKey entities in MongoDB.
 *
 * @template TApiKey - The domain type extending MeetApiKey (default: MeetApiKey)
 */
@injectable()
export class ApiKeyRepository<TApiKey extends MeetApiKey = MeetApiKey> extends BaseRepository<
	TApiKey,
	MeetApiKeyDocument
> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetApiKeyModel);
	}

	protected toDomain(document: MeetApiKeyDocument): TApiKey {
		return document.toObject() as TApiKey;
	}

	/**
	 * Creates a new API key.
	 */
	async create(apiKey: TApiKey): Promise<TApiKey> {
		const doc = await this.createDocument(apiKey);
		return this.toDomain(doc);
	}

	/**
	 * Returns all API keys.
	 */
	async findAll(): Promise<TApiKey[]> {
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
