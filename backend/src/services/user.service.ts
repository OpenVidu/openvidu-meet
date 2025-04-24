import { SingleUserAuth, SingleUserCredentials, User, UserRole } from '@typings-ce';
import { inject, injectable } from 'inversify';
import { MEET_ADMIN_USER } from '../environment.js';
import { LoggerService, MeetStorageService } from './index.js';

@injectable()
export class UserService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(MeetStorageService) protected globalPrefService: MeetStorageService
	) {}

	async getUser(username: string): Promise<User | null> {
		if (username === MEET_ADMIN_USER) {
			return {
				username: MEET_ADMIN_USER,
				role: UserRole.ADMIN
			};
		}

		const userCredentials = await this.getStoredUserCredentials();

		if (userCredentials && username === userCredentials.username) {
			return {
				username,
				role: UserRole.USER
			};
		}

		return null;
	}

	async getStoredUserCredentials(): Promise<SingleUserCredentials | null> {
		try {
			const { securityPreferences } = await this.globalPrefService.getGlobalPreferences();
			const { method: authMethod } = securityPreferences.authentication;
			return (authMethod as SingleUserAuth).credentials;
		} catch (error) {
			this.logger.error('Error getting stored user credentials:' + error);
			return null;
		}
	}
}
