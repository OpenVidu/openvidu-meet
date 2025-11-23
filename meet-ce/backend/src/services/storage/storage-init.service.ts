import { inject, injectable } from 'inversify';
import ms from 'ms';
import { MEET_ENV } from '../../environment.js';
import { MeetLock } from '../../helpers/redis.helper.js';
import { internalError } from '../../models/error.model.js';
import { GlobalConfigRepository } from '../../repositories/global-config.repository.js';
import { ApiKeyService } from '../api-key.service.js';
import { GlobalConfigService } from '../global-config.service.js';
import { LoggerService } from '../logger.service.js';
import { MutexService } from '../mutex.service.js';
import { UserService } from '../user.service.js';

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
		@inject(ApiKeyService) private apiKeyService: ApiKeyService
	) {}

	/**
	 * Initializes the storage with default data if not already initialized.
	 * This includes global config, admin user and API key.
	 */
	async initializeStorage(): Promise<void> {
		const lockKey = MeetLock.getStorageInitializationLock();
		let lockAcquired = false;

		try {
			// Acquire a global lock to prevent multiple initializations at the same time when running in HA mode
			const lock = await this.mutexService.acquire(lockKey, ms('30s'));

			if (!lock) {
				this.logger.warn(
					'Unable to acquire lock for storage initialization. May be already initialized by another instance.'
				);
				return;
			}

			lockAcquired = true;

			const isInitialized = await this.checkStorageInitialization();

			if (isInitialized) {
				this.logger.verbose('Storage already initialized for this project');
				return;
			}

			this.logger.info('Starting storage initialization with default data');

			// Initialize all components
			await Promise.all([
				this.globalConfigService.initializeGlobalConfig(),
				this.userService.initializeAdminUser(),
				this.apiKeyService.initializeApiKey()
			]);

			this.logger.info('Storage initialization completed successfully');
		} catch (error) {
			this.logger.error('Error initializing storage with default data:', error);
			throw internalError('Failed to initialize storage');
		} finally {
			// Always release the lock after initialization completes or fails
			if (lockAcquired) {
				await this.mutexService.release(lockKey);
				this.logger.debug('Storage initialization lock released');
			}
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
			const existingConfig = await this.globalConfigRepository.get();

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
