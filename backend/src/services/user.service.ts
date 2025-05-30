import { User, UserDTO, UserRole } from '@typings-ce';
import { inject, injectable } from 'inversify';
import INTERNAL_CONFIG from '../config/internal-config.js';
import { MeetStorageService } from './index.js';

@injectable()
export class UserService {
	constructor(@inject(MeetStorageService) protected storageService: MeetStorageService) {}

	async getUser(username: string): Promise<User | null> {
		return this.storageService.getUser(username);
	}

	getAnonymousUser(): User {
		return {
			username: INTERNAL_CONFIG.ANONYMOUS_USER,
			passwordHash: '',
			roles: [UserRole.USER]
		};
	}

	getApiUser(): User {
		return {
			username: INTERNAL_CONFIG.API_USER,
			passwordHash: '',
			roles: [UserRole.APP]
		};
	}

	// Convert user to UserDTO to remove sensitive information
	convertToDTO(user: User): UserDTO {
		const { passwordHash, ...userDTO } = user;
		return userDTO;
	}
}
