import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { MeetLock } from '../../helpers/redis.helper.js';
import { internalError } from '../../models/error.model.js';
import { ApiKeyService } from '../api-key.service.js';
import { GlobalConfigService } from '../global-config.service.js';
import { LoggerService } from '../logger.service.js';
import { MutexService } from '../mutex.service.js';
import { UserService } from '../user.service.js';
import { WebhookRegistryService } from '../webhook-registry.service.js';

/**
 * Seeds the data a deployment starts with: global config, admin user, API key and initial webhook.
 */
@injectable()
export class StorageInitService {
	constructor(
		@inject(LoggerService) private logger: LoggerService,
		@inject(MutexService) private mutexService: MutexService,
		@inject(GlobalConfigService) private globalConfigService: GlobalConfigService,
		@inject(UserService) private userService: UserService,
		@inject(ApiKeyService) private apiKeyService: ApiKeyService,
		@inject(WebhookRegistryService) private webhookRegistryService: WebhookRegistryService
	) {}

	/**
	 * Runs every initializer on every start. Each one creates its item only when it is missing, so
	 * an instance that finds the lock taken waits and then runs them itself instead of assuming the
	 * holder completed them. If the lock is still unavailable after the retry budget, startup fails
	 * rather than serving on unseeded storage.
	 */
	async initializeStorage(): Promise<void> {
		const lockKey = MeetLock.getStorageInitializationLock();

		try {
			const executionResult = await this.mutexService.withRetryLock(
				lockKey,
				ms(INTERNAL_CONFIG.STORAGE_INIT_LOCK_TTL),
				async () => {
					this.logger.info('Starting storage initialization with default data');
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
}
