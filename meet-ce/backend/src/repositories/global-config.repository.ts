import { GlobalConfig } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MeetGlobalConfigDocument, MeetGlobalConfigModel } from '../models/mongoose-schemas/global-config.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing GlobalConfig in MongoDB.
 *
 * IMPORTANT: This collection should only contain ONE document representing the
 * system-wide global configuration. Methods are designed to work with this singleton pattern.
 *
 * @template TGlobalConfig - The domain type extending GlobalConfig (default: GlobalConfig)
 */
@injectable()
export class GlobalConfigRepository<TGlobalConfig extends GlobalConfig = GlobalConfig> extends BaseRepository<
	TGlobalConfig,
	MeetGlobalConfigDocument
> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetGlobalConfigModel);
	}

	/**
	 * Transforms a MongoDB document into a domain GlobalConfig object.
	 *
	 * @param document - The MongoDB document
	 * @returns GlobalConfig domain object
	 */
	protected toDomain(document: MeetGlobalConfigDocument): TGlobalConfig {
		return document.toObject() as TGlobalConfig;
	}

	/**
	 * Creates the global configuration document.
	 *
	 * WARNING: This should only be called once during system initialization.
	 * If a config already exists, use update() instead.
	 *
	 * @param config - The global configuration data to create
	 * @returns The created global configuration
	 */
	async create(config: TGlobalConfig): Promise<TGlobalConfig> {
		const document = await this.createDocument(config);
		return this.toDomain(document);
	}

	/**
	 * Updates the global configuration.
	 *
	 * Since there's only one document, this updates the first (and only) document in the collection.
	 *
	 * @param config - The complete updated global configuration data
	 * @returns The updated global configuration
	 * @throws Error if no config exists
	 */
	async update(config: TGlobalConfig): Promise<TGlobalConfig> {
		// Update the first document in the collection (there should only be one)
		const document = await this.updateOne({}, config);
		return this.toDomain(document);
	}

	/**
	 * Retrieves the global configuration.
	 *
	 * @returns The global configuration or null if not found
	 */
	async get(): Promise<TGlobalConfig | null> {
		// Get the first (and only) document from the collection
		const document = await this.findOne({});
		return document ? this.toDomain(document) : null;
	}

	/**
	 * Deletes the global configuration.
	 *
	 * WARNING: This will remove the global config document from the database.
	 * Use with caution.
	 */
	async delete(): Promise<void> {
		await this.deleteMany({});
	}
}
