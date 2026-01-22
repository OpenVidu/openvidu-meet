import { MeetUser, MeetUserDTO, MeetUserFilters, MeetUserOptions, MeetUserRole } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MEET_ENV } from '../environment.js';
import { PasswordHelper } from '../helpers/password.helper.js';
import {
	errorCannotChangeOwnRole,
	errorCannotChangeRootAdminRole,
	errorCannotDeleteOwnAccount,
	errorCannotDeleteRootAdmin,
	errorCannotResetOwnPassword,
	errorCannotResetRootAdminPassword,
	errorInvalidPassword,
	errorUserAlreadyExists,
	errorUserNotFound
} from '../models/error.model.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { LoggerService } from './logger.service.js';
import { RequestSessionService } from './request-session.service.js';

@injectable()
export class UserService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(UserRepository) protected userRepository: UserRepository,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(RoomMemberRepository) protected roomMemberRepository: RoomMemberRepository,
		@inject(RequestSessionService) protected requestSessionService: RequestSessionService
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

	/**
	 * Reset user password by admin. This is used when a user forgets their password.
	 * The mustChangePassword flag is set to true to force the user to change the password on next login.
	 *
	 * @param userId - The ID of the user whose password will be reset
	 * @param newPassword - The new temporary password set by admin
	 */
	async resetUserPassword(userId: string, newPassword: string): Promise<void> {
		// Prevent resetting own password (use change-password endpoint instead)
		const authenticatedUser = this.requestSessionService.getAuthenticatedUser();

		if (authenticatedUser && authenticatedUser.userId === userId) {
			throw errorCannotResetOwnPassword();
		}

		// Prevent resetting password for the root admin user
		if (userId === MEET_ENV.INITIAL_ADMIN_USER) {
			throw errorCannotResetRootAdminPassword();
		}

		const user = await this.userRepository.findByUserId(userId);

		if (!user) {
			throw errorUserNotFound(userId);
		}

		user.passwordHash = await PasswordHelper.hashPassword(newPassword);
		user.mustChangePassword = true; // Force password change on next login

		await this.userRepository.update(user);
		this.logger.info(`Password reset for user '${userId}' by admin. User must change password on next login.`);
	}

	/**
	 * Change user role by admin.
	 *
	 * @param userId - The ID of the user whose role will be changed
	 * @param newRole - The new role to assign to the user
	 */
	async changeUserRole(userId: string, newRole: MeetUserRole): Promise<MeetUser> {
		// Prevent changing role of the root admin user
		if (userId === MEET_ENV.INITIAL_ADMIN_USER) {
			throw errorCannotChangeRootAdminRole();
		}

		// Prevent changing own role
		const authenticatedUser = this.requestSessionService.getAuthenticatedUser();

		if (authenticatedUser && authenticatedUser.userId === userId) {
			throw errorCannotChangeOwnRole();
		}

		const user = await this.userRepository.findByUserId(userId);

		if (!user) {
			throw errorUserNotFound(userId);
		}

		user.role = newRole;
		await this.userRepository.update(user);

		this.logger.info(`Role for user '${userId}' changed to '${newRole}' by admin`);
		return user;
	}

	async deleteUser(userId: string): Promise<void> {
		// Prevent deleting the root admin user
		if (userId === MEET_ENV.INITIAL_ADMIN_USER) {
			throw errorCannotDeleteRootAdmin();
		}

		// Prevent self-deletion
		const authenticatedUser = this.requestSessionService.getAuthenticatedUser();

		if (authenticatedUser && authenticatedUser.userId === userId) {
			throw errorCannotDeleteOwnAccount();
		}

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
		const rootAdminUserId = MEET_ENV.INITIAL_ADMIN_USER;
		const authenticatedUser = this.requestSessionService.getAuthenticatedUser();

		// Filter out the root admin user and authenticated user from the deletion list
		const failed: { userId: string; error: string }[] = [];
		let filteredUserIds = [...userIds];

		if (userIds.includes(rootAdminUserId)) {
			failed.push({ userId: rootAdminUserId, error: 'Cannot delete the root admin user' });
			filteredUserIds = filteredUserIds.filter((id) => id !== rootAdminUserId);
		}

		if (
			authenticatedUser &&
			authenticatedUser?.userId !== rootAdminUserId &&
			userIds.includes(authenticatedUser.userId)
		) {
			failed.push({ userId: authenticatedUser.userId, error: 'Cannot delete your own account' });
			filteredUserIds = filteredUserIds.filter((id) => id !== authenticatedUser.userId);
		}

		const usersToDelete = await this.userRepository.findByUserIds(filteredUserIds);
		const foundUserIds = usersToDelete.map((u) => u.userId);

		failed.push(
			...filteredUserIds
				.filter((id) => !foundUserIds.includes(id))
				.map((id) => ({ userId: id, error: 'User not found' }))
		);

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
