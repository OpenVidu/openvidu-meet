import { User, UserDTO, UserRole } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_INITIAL_ADMIN_PASSWORD, MEET_INITIAL_ADMIN_USER } from '../environment.js';
import { PasswordHelper } from '../helpers/password.helper.js';
import { errorInvalidPassword, internalError } from '../models/error.model.js';
import { UserRepository } from '../repositories/index.js';
import { LoggerService } from './index.js';

@injectable()
export class UserService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(UserRepository) protected userRepository: UserRepository
	) {}

	/**
	 * Initializes the default admin user
	 */
	async initializeAdminUser(): Promise<void> {
		const admin: User = {
			username: MEET_INITIAL_ADMIN_USER,
			passwordHash: await PasswordHelper.hashPassword(MEET_INITIAL_ADMIN_PASSWORD),
			roles: [UserRole.ADMIN, UserRole.USER]
		};

		await this.userRepository.create(admin);
		this.logger.info(`Admin user initialized with default credentials`);
	}

	async authenticateUser(username: string, password: string): Promise<User | null> {
		const user = await this.getUser(username);

		if (!user || !(await PasswordHelper.verifyPassword(password, user.passwordHash))) {
			return null;
		}

		return user;
	}

	async getUser(username: string): Promise<User | null> {
		return this.userRepository.findByUsername(username);
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
		const user = await this.userRepository.findByUsername(username);

		if (!user) {
			throw internalError(`getting user ${username} for password change`);
		}

		const isCurrentPasswordValid = await PasswordHelper.verifyPassword(currentPassword, user.passwordHash);

		if (!isCurrentPasswordValid) {
			throw errorInvalidPassword();
		}

		user.passwordHash = await PasswordHelper.hashPassword(newPassword);
		await this.userRepository.update(user);
	}

	// Convert user to UserDTO to remove sensitive information
	convertToDTO(user: User): UserDTO {
		const { passwordHash, ...userDTO } = user;
		return userDTO;
	}
}
