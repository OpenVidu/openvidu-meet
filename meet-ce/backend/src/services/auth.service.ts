import { MeetApiKey, User } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { PasswordHelper } from '../helpers/index.js';
import { errorApiKeyNotConfigured } from '../models/error.model.js';
import { ApiKeyRepository } from '../repositories/index.js';
import { UserService } from './index.js';

@injectable()
export class AuthService {
	constructor(
		@inject(UserService) protected userService: UserService,
		@inject(ApiKeyRepository) protected apiKeyRepository: ApiKeyRepository
	) {}

	async authenticateUser(username: string, password: string): Promise<User | null> {
		const user = await this.userService.getUser(username);

		if (!user || !(await PasswordHelper.verifyPassword(password, user.passwordHash))) {
			return null;
		}

		return user;
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
