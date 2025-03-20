import { MEET_ADMIN_USER, MEET_USER } from '../environment.js';
import { injectable } from '../config/dependency-injector.config.js';
import { Role, User } from '@typings-ce';

@injectable()
export class UserService {
	getUser(username: string): User | null {
		if (username === MEET_ADMIN_USER) {
			return {
				username: MEET_ADMIN_USER,
				role: Role.ADMIN
			};
		}

		if (username === MEET_USER) {
			return {
				username: MEET_USER,
				role: Role.USER
			};
		}

		return null;
	}
}
