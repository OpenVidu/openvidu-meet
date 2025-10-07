import { MeetApiKey, User } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { PasswordHelper } from '../helpers/index.js';
import { errorApiKeyNotConfigured } from '../models/error.model.js';
import { MeetStorageService, UserService } from './index.js';

@injectable()
export class AuthService {
	constructor(
		@inject(UserService) protected userService: UserService,
		@inject(MeetStorageService) protected storageService: MeetStorageService
	) {}

	async authenticateUser(username: string, password: string): Promise<User | null> {
		const user = await this.userService.getUser(username);

		if (!user || !(await PasswordHelper.verifyPassword(password, user.passwordHash))) {
			return null;
		}

		return user;
	}

	async createApiKey(): Promise<MeetApiKey> {
		const apiKey = PasswordHelper.generateApiKey();
		await this.storageService.saveApiKey(apiKey);
		return apiKey;
	}

	async getApiKeys(): Promise<MeetApiKey[]> {
		const apiKeys = await this.storageService.getApiKeys();
		return apiKeys;
	}

	async deleteApiKeys() {
		await this.storageService.deleteApiKeys();
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
