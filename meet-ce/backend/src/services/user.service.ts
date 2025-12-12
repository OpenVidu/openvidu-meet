import { MeetUser, MeetUserDTO, MeetUserFilters, MeetUserOptions, MeetUserRole } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MEET_ENV } from '../environment.js';
import { PasswordHelper } from '../helpers/password.helper.js';
import { errorInvalidPassword, errorUserAlreadyExists, errorUserNotFound } from '../models/error.model.js';
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
		const existingUser = await this.userRepository.findByUserId(MEET_ENV.INITIAL_ADMIN_USER);

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

	async createUser(userOptions: MeetUserOptions): Promise<MeetUser> {
		const existingUser = await this.userRepository.findByUserId(userOptions.userId);

		if (existingUser) {
			throw errorUserAlreadyExists(userOptions.userId);
		}

		const passwordHash = await PasswordHelper.hashPassword(userOptions.password);
		const user: MeetUser = {
			userId: userOptions.userId,
			name: userOptions.name,
			role: userOptions.role,
			passwordHash
		};

		return this.userRepository.create(user);
	}

	async getUsers(filters: MeetUserFilters): Promise<{
		users: MeetUser[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		return this.userRepository.find(filters);
	}

	async authenticateUser(userId: string, password: string): Promise<MeetUser | null> {
		const user = await this.getUser(userId);

		if (!user || !(await PasswordHelper.verifyPassword(password, user.passwordHash))) {
			return null;
		}

		return user;
	}

	async getUser(userId: string): Promise<MeetUser | null> {
		return this.userRepository.findByUserId(userId);
	}

	async getUserAssociatedWithApiKey(): Promise<MeetUser | null> {
		// Return admin user for API key access
		return this.userRepository.findByUserId(MEET_ENV.INITIAL_ADMIN_USER);
	}

	async changePassword(userId: string, currentPassword: string, newPassword: string) {
		const user = await this.userRepository.findByUserId(userId);

		if (!user) {
			throw errorUserNotFound(userId);
		}

		const isCurrentPasswordValid = await PasswordHelper.verifyPassword(currentPassword, user.passwordHash);

		if (!isCurrentPasswordValid) {
			throw errorInvalidPassword();
		}

		user.passwordHash = await PasswordHelper.hashPassword(newPassword);
		await this.userRepository.update(user);
	}

	async deleteUser(userId: string): Promise<void> {
		const user = await this.userRepository.findByUserId(userId);

		if (!user) {
			throw errorUserNotFound(userId);
		}

		await this.userRepository.deleteByUserId(userId);
	}

	async bulkDeleteUsers(
		userIds: string[]
	): Promise<{ deleted: string[]; failed: { userId: string; error: string }[] }> {
		const usersToDelete = await this.userRepository.findByUserIds(userIds);
		const foundUserIds = usersToDelete.map((u) => u.userId);

		const failed = userIds
			.filter((id) => !foundUserIds.includes(id))
			.map((id) => ({ userId: id, error: 'User not found' }));

		if (foundUserIds.length > 0) {
			await this.userRepository.deleteByUserIds(foundUserIds);
		}

		return {
			deleted: foundUserIds,
			failed
		};
	}

	// Convert user to UserDTO to remove sensitive information
	convertToDTO(user: MeetUser): MeetUserDTO {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { passwordHash, ...userDTO } = user;
		return userDTO;
	}
}
