import { MeetUser, MeetUserDTO, MeetUserRole } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MEET_ENV } from '../environment.js';
import { PasswordHelper } from '../helpers/password.helper.js';
import { errorInvalidPassword, internalError } from '../models/error.model.js';
import { UserRepository } from '../repositories/user.repository.js';
import { LoggerService } from './logger.service.js';

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
		// Check if the admin user already exists
		const existingUser = await this.userRepository.findByUsername(MEET_ENV.INITIAL_ADMIN_USER);

		if (existingUser) {
			this.logger.info('Admin user already initialized, skipping admin user initialization');
			return;
		}

		const admin: MeetUser = {
			userId: MEET_ENV.INITIAL_ADMIN_USER,
			name: 'Admin',
			role: MeetUserRole.ADMIN,
			passwordHash: await PasswordHelper.hashPassword(MEET_ENV.INITIAL_ADMIN_PASSWORD)
		};

		await this.userRepository.create(admin);
		this.logger.info(`Admin user initialized with default credentials`);
	}

	async authenticateUser(userId: string, password: string): Promise<MeetUser | null> {
		const user = await this.getUser(userId);

		if (!user || !(await PasswordHelper.verifyPassword(password, user.passwordHash))) {
			return null;
		}

		return user;
	}

	async getUser(userId: string): Promise<MeetUser | null> {
		return this.userRepository.findByUsername(userId);
	}

	async getUserAssociatedWithApiKey(): Promise<MeetUser | null> {
		// Return admin user for API key access
		return this.userRepository.findByUsername(MEET_ENV.INITIAL_ADMIN_USER);
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
	convertToDTO(user: MeetUser): MeetUserDTO {
		const { passwordHash, ...userDTO } = user;
		return userDTO;
	}
}
