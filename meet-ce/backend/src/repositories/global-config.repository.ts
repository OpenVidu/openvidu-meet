import { GlobalConfig } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';
import { MeetGlobalConfigDocument, MeetGlobalConfigModel } from './schemas/global-config.schema.js';

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
	 * @returns The updated global configuration, or null if no config exists
	 */
	async update(config: TGlobalConfig): Promise<TGlobalConfig | null> {
		// Update the first document in the collection (there should only be one)
		const document = await this.updateOne({}, config);
		return document ? this.toDomain(document) : null;
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
	 * WARNING: This should only be used in testing or system reset scenarios.
	 *
	 * @throws Error if no global config exists
	 */
	async delete(): Promise<void> {
		await this.deleteOne({});
	}
}
