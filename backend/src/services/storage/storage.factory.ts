import { inject, injectable } from 'inversify';
import { LoggerService } from '../index.js';
import { StorageKeyBuilder, StorageProvider } from './storage.interface.js';
import { container, STORAGE_TYPES } from '../../config/dependency-injector.config.js';

/**
 * Factory class responsible for creating the appropriate basic storage provider
 * based on configuration.
 *
 * This factory determines which basic storage implementation to use based on the
 * `MEET_PREFERENCES_STORAGE_MODE` environment variable. It creates providers that
 * handle only basic CRUD operations, following the Single Responsibility Principle.
 *
 * Domain-specific logic should be handled in the MeetStorageService layer.
 */
@injectable()
export class StorageFactory {
	constructor(@inject(LoggerService) protected logger: LoggerService) {}

	/**
	 * Creates a basic storage provider based on the configured storage mode.
	 *
	 * @returns StorageProvider instance configured for the specified storage backend
	 */
	create(): { provider: StorageProvider; keyBuilder: StorageKeyBuilder } {
		// The actual binding is handled in the DI configuration
		// This factory just returns the pre-configured instances
		return {
			provider: container.get<StorageProvider>(STORAGE_TYPES.StorageProvider),
			keyBuilder: container.get<StorageKeyBuilder>(STORAGE_TYPES.KeyBuilder)
		};
	}
}
