import type { MeetApiKey } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { PasswordHelper } from '../helpers/password.helper.js';
import { MeetLock } from '../helpers/redis.helper.js';
import { errorApiKeyChangeInProgress, errorApiKeyNotConfigured } from '../models/error.model.js';
import { ApiKeyRepository } from '../repositories/api-key.repository.js';
import { LoggerService } from './logger.service.js';
import { MutexService } from './mutex.service.js';
import { UserService } from './user.service.js';

@injectable()
export class ApiKeyService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(UserService) protected userService: UserService,
		@inject(ApiKeyRepository) protected apiKeyRepository: ApiKeyRepository,
		@inject(MutexService) protected mutexService: MutexService
	) {}

	/**
	 * Seeds `MEET_INITIAL_API_KEY` when no API key exists yet.
	 */
	async initializeApiKey(): Promise<void> {
		const initialApiKey = MEET_ENV.INITIAL_API_KEY;

		if (!initialApiKey) {
			this.logger.info('No initial API key configured, skipping API key initialization');
			return;
		}

		const initialized = await this.withApiKeyLock(async () => {
			const existingKeys = await this.apiKeyRepository.findAll();

			if (existingKeys.length > 0) {
				this.logger.info('API key already initialized, skipping API key initialization');
				return true;
			}

			await this.apiKeyRepository.create(PasswordHelper.generateApiKey(initialApiKey));
			this.logger.info('API key initialized');
			return true;
		});

		if (!initialized) {
			throw new Error(`Could not acquire the API key lock '${MeetLock.getApiKeyLock()}'`);
		}
	}

	/**
	 * Replaces the API key with a new one.
	 *
	 * @throws A 409 error when another API key change still holds the lock after the retries
	 */
	async createApiKey(): Promise<MeetApiKey> {
		const apiKey = await this.withApiKeyLock(async () => {
			const existingKeys = await this.apiKeyRepository.findAll();

			if (existingKeys.length > 0) {
				await this.apiKeyRepository.deleteAll();
			}

			return this.apiKeyRepository.create(PasswordHelper.generateApiKey());
		});

		if (!apiKey) {
			throw errorApiKeyChangeInProgress();
		}

		return apiKey;
	}

	async getApiKeys(): Promise<MeetApiKey[]> {
		const apiKeys = await this.apiKeyRepository.findAll();
		return apiKeys;
	}

	async deleteApiKeys() {
		await this.apiKeyRepository.deleteAll();
	}

	async validateApiKey(apiKey: string): Promise<boolean> {
		let storedApiKeys: MeetApiKey[];

		try {
			storedApiKeys = await this.getApiKeys();
		} catch {
			// If there is an error retrieving API keys, we assume they are not configured
			storedApiKeys = [];
		}

		if (storedApiKeys.length === 0) {
			throw errorApiKeyNotConfigured();
		}

		// Check if the provided API key matches any stored API key
		return storedApiKeys.some((key) => key.key === apiKey);
	}

	/**
	 * Every API key writer that creates a key runs under this lock, so on any number of replicas exactly one key remains.
	 */
	protected withApiKeyLock<T>(callback: () => Promise<T>): Promise<T | null> {
		return this.mutexService.withRetryLock(
			MeetLock.getApiKeyLock(),
			ms(INTERNAL_CONFIG.API_KEY_LOCK_TTL),
			callback,
			INTERNAL_CONFIG.API_KEY_LOCK_MAX_ATTEMPTS,
			ms(INTERNAL_CONFIG.API_KEY_LOCK_RETRY_DELAY)
		);
	}
}
