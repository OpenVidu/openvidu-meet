import { User } from '@typings-ce';
import { inject, injectable } from 'inversify';
import { PasswordHelper } from '../helpers/index.js';
import { LoggerService, MeetStorageService, UserService } from './index.js';

@injectable()
export class AuthService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(UserService) protected userService: UserService,
		@inject(MeetStorageService) protected globalPrefService: MeetStorageService
	) {}

	async authenticate(username: string, password: string): Promise<User | null> {
		const user = await this.userService.getUser(username);

		if (!user || !(await PasswordHelper.verifyPassword(password, user.passwordHash))) {
			return null;
		}

		return user;
	}
}
