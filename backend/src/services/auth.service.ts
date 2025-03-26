import { MEET_ADMIN_SECRET, MEET_ADMIN_USER } from '../environment.js';
import { inject, injectable } from '../config/dependency-injector.config.js';
import { User } from '@typings-ce';
import { UserService } from './user.service.js';
import { GlobalPreferencesService } from './preferences/global-preferences.service.js';
import { LoggerService } from './logger.service.js';
import { PasswordHelper } from '../helpers/password.helper.js';

@injectable()
export class AuthService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(UserService) protected userService: UserService,
		@inject(GlobalPreferencesService) protected globalPrefService: GlobalPreferencesService
	) {}

	async authenticate(username: string, password: string): Promise<User | null> {
		const isAdmin = this.authenticateAdmin(username, password);
		const isUser = await this.authenticateUser(username, password);

		if (isAdmin || isUser) {
			return this.userService.getUser(username);
		}

		return null;
	}

	private authenticateAdmin(username: string, password: string): boolean {
		return username === MEET_ADMIN_USER && password === MEET_ADMIN_SECRET;
	}

	private async authenticateUser(username: string, password: string): Promise<boolean> {
		const userCredentials = await this.userService.getStoredUserCredentials();

		if (!userCredentials) {
			return false;
		}

		const isPasswordValid = await PasswordHelper.verifyPassword(password, userCredentials.passwordHash);
		return username === userCredentials.username && isPasswordValid;
	}
}
