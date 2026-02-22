import { GlobalConfig } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { Require_id } from 'mongoose';
import { MeetGlobalConfigDocument, MeetGlobalConfigModel } from '../models/mongoose-schemas/global-config.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing GlobalConfig in MongoDB.
 *
 * IMPORTANT: This collection should only contain ONE document representing the
 * system-wide global configuration. Methods are designed to work with this singleton pattern.
 */
@injectable()
export class GlobalConfigRepository extends BaseRepository<GlobalConfig, MeetGlobalConfigDocument> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetGlobalConfigModel);
	}

	protected toDomain(dbObject: Require_id<MeetGlobalConfigDocument> & { __v: number }): GlobalConfig {
		const { _id, __v, schemaVersion, ...globalConfig } = dbObject;
		(void _id, __v, schemaVersion);
		return globalConfig as GlobalConfig;
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
	async create(config: GlobalConfig): Promise<GlobalConfig> {
		return this.createDocument(config);
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
	async update(config: GlobalConfig): Promise<GlobalConfig> {
		// Update the first document in the collection (there should only be one)
		return this.updateOne({}, config);
	}

	/**
	 * Retrieves the global configuration.
	 *
	 * @returns The global configuration or null if not found
	 */
	async get(): Promise<GlobalConfig | null> {
		// Get the first (and only) document from the collection
		return this.findOne({});
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
