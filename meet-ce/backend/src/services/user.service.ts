import { MeetUser, MeetUserDTO, MeetUserFilters, MeetUserOptions, MeetUserRole } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MEET_ENV } from '../environment.js';
import { PasswordHelper } from '../helpers/password.helper.js';
import { errorInvalidPassword, errorUserAlreadyExists, errorUserNotFound } from '../models/error.model.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { LoggerService } from './logger.service.js';

@injectable()
export class UserService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(UserRepository) protected userRepository: UserRepository,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(RoomMemberRepository) protected roomMemberRepository: RoomMemberRepository
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
			registrationDate: Date.now(),
			role: MeetUserRole.ADMIN,
			passwordHash: await PasswordHelper.hashPassword(MEET_ENV.INITIAL_ADMIN_PASSWORD),
			mustChangePassword: false
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
			registrationDate: Date.now(),
			role: userOptions.role,
			passwordHash,
			mustChangePassword: true
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
		user.mustChangePassword = false; // Clear the flag (if needed) after password change

		await this.userRepository.update(user);
	}

	async deleteUser(userId: string): Promise<void> {
		const user = await this.userRepository.findByUserId(userId);

		if (!user) {
			throw errorUserNotFound(userId);
		}

		// Clean up user resources using bulk method
		await this.bulkCleanupUserResources([userId]);

		// Finally, delete the user
		await this.userRepository.deleteByUserId(userId);
		this.logger.info(`User '${userId}' deleted successfully`);
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
			// Clean up resources for all users in batches
			await this.bulkCleanupUserResources(foundUserIds);

			// Delete all users after cleanup
			await this.userRepository.deleteByUserIds(foundUserIds);
			this.logger.info(`Bulk deleted ${foundUserIds.length} user(s) successfully`);
		}

		return {
			deleted: foundUserIds,
			failed
		};
	}

	/**
	 * Cleans up resources for multiple users in batches:
	 * - Deletes all room memberships
	 * - Transfers ownership of owned rooms to the global admin
	 *
	 * @param userIds - Array of user IDs to clean up
	 */
	private async bulkCleanupUserResources(userIds: string[]): Promise<void> {
		const adminUserId = MEET_ENV.INITIAL_ADMIN_USER;
		const USER_BATCH_SIZE = 10; // Process users in batches of 10
		const ROOM_UPDATE_BATCH_SIZE = 50; // Update rooms in batches of 50

		// Process users in batches
		for (let i = 0; i < userIds.length; i += USER_BATCH_SIZE) {
			const userBatch = userIds.slice(i, i + USER_BATCH_SIZE);

			// Delete all memberships and fetch all owned rooms for this batch in parallel
			const [, ownedRoomsPerUser] = await Promise.all([
				// Delete memberships for all users in this batch in parallel
				Promise.all(userBatch.map((userId) => this.roomMemberRepository.deleteAllByMemberId(userId))),
				// Fetch owned rooms for all users in this batch in parallel
				Promise.all(userBatch.map((userId) => this.roomRepository.findByOwner(userId)))
			]);

			// Flatten all owned rooms from this batch
			const batchOwnedRooms = ownedRoomsPerUser.flat();

			if (batchOwnedRooms.length > 0) {
				// Update rooms in sub-batches to avoid overwhelming the database
				for (let j = 0; j < batchOwnedRooms.length; j += ROOM_UPDATE_BATCH_SIZE) {
					const roomBatch = batchOwnedRooms.slice(j, j + ROOM_UPDATE_BATCH_SIZE);

					await Promise.all(
						roomBatch.map((room) => {
							room.owner = adminUserId;
							return this.roomRepository.update(room);
						})
					);
				}

				this.logger.info(
					`Processed batch: Transferred ownership of ${batchOwnedRooms.length} room(s) from ${userBatch.length} user(s) to admin '${adminUserId}'`
				);
			}
		}

		this.logger.info(`Completed cleanup for ${userIds.length} user(s)`);
	}

	// Convert user to UserDTO to remove sensitive information
	convertToDTO(user: MeetUser): MeetUserDTO {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { passwordHash, ...userDTO } = user;
		return userDTO;
	}
}
