import { User } from '@typings-ce';
import { inject, injectable } from 'inversify';
import { MEET_API_KEY } from '../environment.js';
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

	async createApiKey() {
		const apiKey = PasswordHelper.generateApiKey();
		await this.storageService.saveApiKey(apiKey);
		return apiKey;
	}

	async getApiKeys() {
		const apiKeys = await this.storageService.getApiKeys();
		return apiKeys;
	}

	async deleteApiKeys() {
		await this.storageService.deleteApiKeys();
		return { message: 'API keys deleted successfully' };
	}

	async validateApiKey(apiKey: string): Promise<boolean> {
		let storedApiKeys: { key: string; creationDate: number }[];

		try {
			storedApiKeys = await this.getApiKeys();
		} catch (error) {
			// If there is an error retrieving API keys, we assume they are not configured
			storedApiKeys = [];
		}

		if (storedApiKeys.length === 0 && !MEET_API_KEY) {
			throw errorApiKeyNotConfigured();
		}

		// Check if the provided API key matches any stored API key or the MEET_API_KEY
		return storedApiKeys.some((key) => key.key === apiKey) || apiKey === MEET_API_KEY;
	}
}
