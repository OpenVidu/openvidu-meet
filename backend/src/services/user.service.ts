import { MEET_ADMIN_USER } from '../environment.js';
import { inject, injectable } from '../config/dependency-injector.config.js';
import { AuthType, UserRole, SingleUserAuth, User } from '@typings-ce';
import { LoggerService } from './logger.service.js';
import { GlobalPreferencesService } from './preferences/global-preferences.service.js';

@injectable()
export class UserService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(GlobalPreferencesService) protected globalPrefService: GlobalPreferencesService
	) {}

	async getUser(username: string): Promise<User | null> {
		if (username === MEET_ADMIN_USER) {
			return {
				username: MEET_ADMIN_USER,
				role: UserRole.ADMIN
			};
		}

		let configuredUsername: string | undefined;

		try {
			const { securityPreferences } = await this.globalPrefService.getGlobalPreferences();
			const method = securityPreferences.authentication.method;

			if (method.type === AuthType.SINGLE_USER) {
				configuredUsername = (method as SingleUserAuth).credentials.username;
			}
		} catch (error) {
			this.logger.error('Error checking room creation policy:' + error);
			return null;
		}

		if (username === configuredUsername) {
			return {
				username: configuredUsername,
				role: UserRole.USER
			};
		}

		return null;
	}
}
