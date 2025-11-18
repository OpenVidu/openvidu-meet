import { MeetApiKey } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MEET_INITIAL_API_KEY } from '../environment.js';
import { PasswordHelper } from '../helpers/index.js';
import { errorApiKeyNotConfigured } from '../models/error.model.js';
import { ApiKeyRepository } from '../repositories/index.js';
import { LoggerService, UserService } from './index.js';

@injectable()
export class ApiKeyService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(UserService) protected userService: UserService,
		@inject(ApiKeyRepository) protected apiKeyRepository: ApiKeyRepository
	) {}

	/**
	 * Initializes the API key if configured
	 */
	async initializeApiKey(): Promise<void> {
		// Check if there are existing API keys
		const existingKeys = await this.apiKeyRepository.findAll();

		if (existingKeys.length > 0) {
			this.logger.info('API key already initialized, skipping API key initialization');
			return;
		}

		// Check if initial API key is configured
		const initialApiKey = MEET_INITIAL_API_KEY;

		if (!initialApiKey) {
			this.logger.info('No initial API key configured, skipping API key initialization');
			return;
		}

		const apiKeyData: MeetApiKey = PasswordHelper.generateApiKey(initialApiKey);
		await this.apiKeyRepository.create(apiKeyData);
		this.logger.info('API key initialized');
	}

	async createApiKey(): Promise<MeetApiKey> {
		// Check if there are existing API keys and delete them (we only allow one API key at a time)
		const existingKeys = await this.apiKeyRepository.findAll();

		if (existingKeys.length > 0) {
			await this.apiKeyRepository.deleteAll();
		}

		// Create new API key
		const apiKey = PasswordHelper.generateApiKey();
		await this.apiKeyRepository.create(apiKey);
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
		} catch (error) {
			// If there is an error retrieving API keys, we assume they are not configured
			storedApiKeys = [];
		}

		if (storedApiKeys.length === 0) {
			throw errorApiKeyNotConfigured();
		}

		// Check if the provided API key matches any stored API key
		return storedApiKeys.some((key) => key.key === apiKey);
	}
}
