import { MEET_ADMIN_SECRET, MEET_ADMIN_USER } from '../environment.js';
import { inject, injectable } from '../config/dependency-injector.config.js';
import { AuthMode, AuthType, SingleUserAuth, User, ValidAuthMethod } from '@typings-ce';
import { UserService } from './user.service.js';
import { GlobalPreferencesService } from './preferences/global-preferences.service.js';
import { LoggerService } from './logger.service.js';

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
		let requireAuthForRoomCreation: boolean;
		let authMode: AuthMode;
		let authMethod: ValidAuthMethod;

		try {
			const { securityPreferences } = await this.globalPrefService.getGlobalPreferences();
			requireAuthForRoomCreation = securityPreferences.roomCreationPolicy.requireAuthentication;
			({ authMode, method: authMethod } = securityPreferences.authentication);
		} catch (error) {
			this.logger.error('Error checking authentication preferences:' + error);
			return false;
		}

		if (requireAuthForRoomCreation || authMode !== AuthMode.NONE) {
			if (authMethod.type !== AuthType.SINGLE_USER) {
				return false;
			}

			const { username: configuredUsername, passwordHash: configurePassword } = (authMethod as SingleUserAuth)
				.credentials;
			return username === configuredUsername && password === configurePassword;
		}

		return false;
	}
}
