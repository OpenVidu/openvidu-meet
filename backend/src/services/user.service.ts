import { User, UserDTO, UserRole } from '@typings-ce';
import { inject, injectable } from 'inversify';
import INTERNAL_CONFIG from '../config/internal-config.js';
import { PasswordHelper } from '../helpers/password.helper.js';
import { errorInvalidPassword, internalError } from '../models/error.model.js';
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

	async changePassword(username: string, currentPassword: string, newPassword: string) {
		const user = await this.storageService.getUser(username);

		if (!user) {
			throw internalError(`getting user ${username} for password change`);
		}

		const isCurrentPasswordValid = await PasswordHelper.verifyPassword(currentPassword, user.passwordHash);

		if (!isCurrentPasswordValid) {
			throw errorInvalidPassword();
		}

		user.passwordHash = await PasswordHelper.hashPassword(newPassword);
		await this.storageService.saveUser(user);
	}

	// Convert user to UserDTO to remove sensitive information
	convertToDTO(user: User): UserDTO {
		const { passwordHash, ...userDTO } = user;
		return userDTO;
	}
}
