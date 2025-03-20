import { MEET_ADMIN_SECRET, MEET_ADMIN_USER, MEET_PRIVATE_ACCESS, MEET_SECRET, MEET_USER } from '../environment.js';
import { inject, injectable } from '../config/dependency-injector.config.js';
import { User } from '@typings-ce';
import { UserService } from './user.service.js';

@injectable()
export class AuthService {
	constructor(@inject(UserService) protected userService: UserService) {}

	authenticate(username: string, password: string): User | null {
		const isAdmin = this.authenticateAdmin(username, password);
		const isUser = this.authenticateUser(username, password);

		if (isAdmin || isUser) {
			return this.userService.getUser(username);
		}

		return null;
	}

	private authenticateAdmin(username: string, password: string): boolean {
		return username === MEET_ADMIN_USER && password === MEET_ADMIN_SECRET;
	}

	private authenticateUser(username: string, password: string): boolean {
		if (MEET_PRIVATE_ACCESS === 'true') {
			return username === MEET_USER && password === MEET_SECRET;
		}

		return false;
	}
}
