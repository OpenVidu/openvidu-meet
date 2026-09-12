import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { MEET_ENV } from '../../environment.js';
import { MeetLock } from '../../helpers/redis.helper.js';
import { internalError } from '../../models/error.model.js';
import { GlobalConfigRepository } from '../../repositories/global-config.repository.js';
import { ApiKeyService } from '../api-key.service.js';
import { GlobalConfigService } from '../global-config.service.js';
import { LoggerService } from '../logger.service.js';
import { MutexService } from '../mutex.service.js';
import { UserService } from '../user.service.js';
import { WebhookRegistryService } from '../webhook-registry.service.js';

/**
 * Service responsible for storage initialization.
 * Coordinates the initialization of global config, admin user, and API key in the database.
 * Handles distributed locking for High Availability scenarios.
 */
@injectable()
export class StorageInitService {
	constructor(
		@inject(LoggerService) private logger: LoggerService,
		@inject(MutexService) private mutexService: MutexService,
		@inject(GlobalConfigService) private globalConfigService: GlobalConfigService,
		@inject(GlobalConfigRepository) private globalConfigRepository: GlobalConfigRepository,
		@inject(UserService) private userService: UserService,
		@inject(ApiKeyService) private apiKeyService: ApiKeyService,
		@inject(WebhookRegistryService) private webhookRegistryService: WebhookRegistryService
	) {}

	/**
	 * Initializes the storage with default data if not already initialized.
	 * This includes global config, admin user and API key.
	 *
	 * The initialization is state-gated, so an instance that finds the lock taken waits and then
	 * runs the check itself instead of assuming the holder completed it. If the lock is still
	 * unavailable after the retry budget, startup fails rather than serving on unseeded storage.
	 */
	async initializeStorage(): Promise<void> {
		const lockKey = MeetLock.getStorageInitializationLock();

		try {
			const executionResult = await this.mutexService.withRetryLock(
				lockKey,
				ms(INTERNAL_CONFIG.STORAGE_INIT_LOCK_TTL),
				async () => {
					const isInitialized = await this.checkStorageInitialization();

					if (isInitialized) {
						this.logger.verbose('Storage already initialized for this project');
						return true;
					}

					this.logger.info('Starting storage initialization with default data');

					// Initialize all components
					await Promise.all([
						this.globalConfigService.initializeGlobalConfig(),
						this.userService.initializeAdminUser(),
						this.apiKeyService.initializeApiKey(),
						this.webhookRegistryService.initializeDefaultWebhook()
					]);

					this.logger.info('Storage initialization completed successfully');
					return true;
				},
				INTERNAL_CONFIG.STORAGE_INIT_LOCK_MAX_ATTEMPTS,
				ms(INTERNAL_CONFIG.STORAGE_INIT_LOCK_RETRY_DELAY)
			);

			if (executionResult === null) {
				throw new Error(
					`Could not acquire storage initialization lock '${lockKey}' after ` +
						`${INTERNAL_CONFIG.STORAGE_INIT_LOCK_MAX_ATTEMPTS} attempts`
				);
			}
		} catch (error) {
			this.logger.error('Error initializing storage with default data:', error);
			throw internalError('Failed to initialize storage');
		}
	}

	/**
	 * Checks if the storage is already initialized by verifying that global config exists
	 * and belongs to the current project.
	 *
	 * @returns True if storage is already initialized for this project
	 */
	private async checkStorageInitialization(): Promise<boolean> {
		try {
			const existingConfig = await this.globalConfigRepository.get(['projectId']);

			if (!existingConfig) {
				this.logger.verbose('No global config found, storage needs initialization');
				return false;
			}

			// Check if it's from the same project
			const existingProjectId = existingConfig.projectId;
			const currentProjectId = MEET_ENV.NAME_ID;

			if (existingProjectId !== currentProjectId) {
				this.logger.info(
					`Different project detected: existing='${existingProjectId}', current='${currentProjectId}'. Re-initialization required.`
				);
				// Clear existing config to allow re-initialization
				await this.globalConfigRepository.delete();
				return false;
			}

			return true;
		} catch (error) {
			this.logger.warn('Error checking storage initialization status:', error);
			throw error;
		}
	}
}
