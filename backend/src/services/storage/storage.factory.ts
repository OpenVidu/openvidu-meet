import { StorageProvider } from './storage.interface.js';
import { S3StorageProvider } from './providers/s3-storage.provider.js';
import { MEET_PREFERENCES_STORAGE_MODE } from '../../environment.js';
import { inject, injectable } from '../../config/dependency-injector.config.js';
import { LoggerService } from '../logger.service.js';

/**
 * Factory class responsible for creating the appropriate storage provider based on configuration.
 *
 * This factory determines which storage implementation to use based on the `MEET_PREFERENCES_STORAGE_MODE`
 * environment variable. Currently supports S3 storage, with more providers potentially added in the future.
 */
@injectable()
export class StorageFactory {
	constructor(
		@inject(S3StorageProvider) protected s3StorageProvider: S3StorageProvider,
		@inject(LoggerService) protected logger: LoggerService
	) {}

	create(): StorageProvider {
		const storageMode = MEET_PREFERENCES_STORAGE_MODE;

		switch (storageMode) {
			case 's3':
				return this.s3StorageProvider;

			default:
				this.logger.info('No preferences storage mode specified. Defaulting to S3.');
				return this.s3StorageProvider;
		}
	}
}
