import { User } from '@typings-ce';
import { inject, injectable } from 'inversify';
import { PasswordHelper } from '../helpers/index.js';
import { MeetStorageService, UserService } from './index.js';

@injectable()
export class AuthService {
	constructor(
		@inject(UserService) protected userService: UserService,
		@inject(MeetStorageService) protected storageService: MeetStorageService
	) {}

	async authenticate(username: string, password: string): Promise<User | null> {
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
}
