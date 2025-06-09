import { User } from '@typings-ce';
import { inject, injectable } from 'inversify';
import { PasswordHelper } from '../helpers/index.js';
import { UserService } from './index.js';

@injectable()
export class AuthService {
	constructor(@inject(UserService) protected userService: UserService) {}

	async authenticate(username: string, password: string): Promise<User | null> {
		const user = await this.userService.getUser(username);

		if (!user || !(await PasswordHelper.verifyPassword(password, user.passwordHash))) {
			return null;
		}

		return user;
	}
}
