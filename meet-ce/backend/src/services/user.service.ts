import type { MeetUser, MeetUserDTO, MeetUserField, MeetUserFilters, MeetUserOptions } from '@openvidu-meet/typings';
import { MeetUserRole } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
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
import { RecordingRepository } from '../repositories/recording.repository.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import type { ProjectedMeetUser } from '../types/user-projection.types.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { LoggerService } from './logger.service.js';
import { MeetingPresenceService } from './meeting-presence.service.js';
import { RequestSessionService } from './request-session.service.js';
import type { RoomMemberService } from './room-member.service.js';

@injectable()
export class UserService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(UserRepository) protected userRepository: UserRepository,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(RoomMemberRepository) protected roomMemberRepository: RoomMemberRepository,
		@inject(RecordingRepository) protected recordingRepository: RecordingRepository,
		@inject(MeetingPresenceService) protected meetingPresenceService: MeetingPresenceService,
		@inject(RequestSessionService) protected requestSessionService: RequestSessionService
	) {}

	/**
	 * TODO: Prevent circular imports when refactoring backend code
	 */
	private async getRoomMemberService(): Promise<RoomMemberService> {
		const { RoomMemberService } = await import('./room-member.service.js');
		return container.get(RoomMemberService);
	}

	/**
	 * Initializes the default admin user
	 */
	async initializeAdminUser(): Promise<void> {
		// Check if the admin user already exists
		const existingUser = await this.userRepository.findByUserId(MEET_ENV.INITIAL_ADMIN_USER, ['userId']);

		if (existingUser) {
			this.logger.info('Admin user already initialized, skipping admin user initialization');
			return;
		}

		const admin: MeetUser = {
			userId: MEET_ENV.INITIAL_ADMIN_USER,
			name: 'Admin',
			registrationDate: Date.now(),
			role: MeetUserRole.ADMIN,
			roleUpdatedAt: Date.now(),
			passwordHash: await PasswordHelper.hashPassword(MEET_ENV.INITIAL_ADMIN_PASSWORD),
			mustChangePassword: false
		};

		await this.userRepository.create(admin);
		this.logger.info(`Admin user initialized with default credentials`);
	}

	async createUser(userOptions: MeetUserOptions): Promise<MeetUser> {
		const existingUser = await this.userRepository.findByUserId(userOptions.userId, ['userId']);

		if (existingUser) {
			throw errorUserAlreadyExists(userOptions.userId);
		}

		const passwordHash = await PasswordHelper.hashPassword(userOptions.password);
		const now = Date.now();
		const user: MeetUser = {
			userId: userOptions.userId,
			name: userOptions.name,
			registrationDate: now,
			role: userOptions.role,
			roleUpdatedAt: now,
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

	async getUser(userId: string): Promise<MeetUser | null>;

	async getUser<const TFields extends readonly MeetUserField[]>(
		userId: string,
		fields: TFields
	): Promise<ProjectedMeetUser<TFields> | null>;

	async getUser(userId: string, fields?: readonly MeetUserField[]): Promise<MeetUser | Partial<MeetUser> | null>;

	async getUser(userId: string, fields?: readonly MeetUserField[]): Promise<MeetUser | Partial<MeetUser> | null> {
		return this.userRepository.findByUserId(userId, fields);
	}

	async getUserAssociatedWithApiKey(): Promise<MeetUser | null> {
		// Return admin user for API key access
		return this.userRepository.findByUserId(MEET_ENV.INITIAL_ADMIN_USER);
	}

	async changePassword(userId: string, currentPassword: string, newPassword: string) {
		const user = await this.userRepository.findByUserId(userId, ['passwordHash']);

		if (!user) {
			throw errorUserNotFound(userId);
		}

		const isCurrentPasswordValid = await PasswordHelper.verifyPassword(currentPassword, user.passwordHash);

		if (!isCurrentPasswordValid) {
			throw errorInvalidPassword();
		}

		await this.userRepository.updatePartial(userId, {
			passwordHash: await PasswordHelper.hashPassword(newPassword),
			mustChangePassword: false // Reset mustChangePassword flag after successful password change
		});
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

		const user = await this.userRepository.findByUserId(userId, ['userId']);

		if (!user) {
			throw errorUserNotFound(userId);
		}

		await this.userRepository.updatePartial(userId, {
			passwordHash: await PasswordHelper.hashPassword(newPassword),
			mustChangePassword: true // Force user to change password on next login
		});
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

		const oldRole = user.role;

		// If the role is the same, no update is needed
		if (oldRole === newRole) {
			this.logger.info(`User '${userId}' already has role '${newRole}', no update needed`);
			return user;
		}

		// If ADMIN or USER becomes ROOM_MEMBER, transfer owned rooms to root admin.
		if ((oldRole === MeetUserRole.ADMIN || oldRole === MeetUserRole.USER) && newRole === MeetUserRole.ROOM_MEMBER) {
			const ownedRooms = await this.roomRepository.findByOwner(userId, ['roomId']);

			if (ownedRooms.length > 0) {
				await runConcurrently(
					ownedRooms,
					async (room) => {
						await Promise.all([
							this.roomRepository.updatePartial(room.roomId, { owner: MEET_ENV.INITIAL_ADMIN_USER }),
							this.recordingRepository.updateAccessScopeMetadataByRoomId(room.roomId, {
								roomOwner: MEET_ENV.INITIAL_ADMIN_USER
							})
						]);
					},
					{ concurrency: INTERNAL_CONFIG.CONCURRENCY_BULK_CLEANUP_USER_RESOURCES, failFast: true }
				);

				this.logger.info(
					`Transferred ownership of ${ownedRooms.length} room(s) from user '${userId}' to admin '${MEET_ENV.INITIAL_ADMIN_USER}' due to role change to '${MeetUserRole.ROOM_MEMBER}'`
				);
			}
		}

		// If USER or ROOM_MEMBER becomes ADMIN, remove room memberships.
		if ((oldRole === MeetUserRole.USER || oldRole === MeetUserRole.ROOM_MEMBER) && newRole === MeetUserRole.ADMIN) {
			await this.roomMemberRepository.deleteAllByMemberId(userId);
			this.logger.info(
				`Removed room memberships for user '${userId}' due to role change to '${MeetUserRole.ADMIN}'`
			);
		}

		const updatedUser = await this.userRepository.updatePartial(userId, {
			role: newRole,
			roleUpdatedAt: Date.now()
		});

		const activeMeetings = await this.meetingPresenceService.getUserMeetings(userId);

		if (activeMeetings.length > 0) {
			const roomMemberService = await this.getRoomMemberService();
			const notifyResults = await runConcurrently(
				activeMeetings,
				async ({ roomId, participantIdentity }) => {
					await roomMemberService.notifyParticipantPermissionsUpdate(roomId, participantIdentity);
					return { roomId, participantIdentity };
				},
				{ concurrency: INTERNAL_CONFIG.CONCURRENCY_BULK_UPDATE_PERMISSIONS }
			);

			const failedNotifications = notifyResults.filter((result) => result.status === 'rejected');

			if (failedNotifications.length > 0) {
				this.logger.warn(
					`Failed to notify ${failedNotifications.length} active participant(s) about role update for user '${userId}'`
				);
			}
		}

		this.logger.info(`Role for user '${userId}' changed to '${newRole}' by admin`);
		return updatedUser;
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

		const user = await this.userRepository.findByUserId(userId, ['userId']);

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

		const usersToDelete = await this.userRepository.findByUserIds(filteredUserIds, ['userId']);
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
	 * - Removes user from all active meetings
	 *
	 * @param userIds - Array of user IDs to clean up
	 */
	private async bulkCleanupUserResources(userIds: string[]): Promise<void> {
		const adminUserId = MEET_ENV.INITIAL_ADMIN_USER;
		const concurrency = INTERNAL_CONFIG.CONCURRENCY_BULK_CLEANUP_USER_RESOURCES;
		const roomMemberService = await this.getRoomMemberService();

		const userCleanupResults = await runConcurrently(
			userIds,
			async (userId) => {
				const activeMeetings = await this.meetingPresenceService.getUserMeetings(userId);

				if (activeMeetings.length > 0) {
					const kickResults = await runConcurrently(
						activeMeetings,
						async ({ roomId, participantIdentity }) => {
							await roomMemberService.kickParticipantFromMeeting(roomId, participantIdentity);
							return { roomId, participantIdentity };
						},
						{ concurrency }
					);

					const failedKicks = kickResults.filter((result) => result.status === 'rejected');

					if (failedKicks.length > 0) {
						this.logger.warn(
							`Failed to kick ${failedKicks.length} participant(s) for user '${userId}' during account cleanup`
						);
					}
				}

				const [ownedRooms] = await Promise.all([
					this.roomRepository.findByOwner(userId, ['roomId']),
					this.roomMemberRepository.deleteAllByMemberId(userId),
					this.meetingPresenceService.removeUserFromAllRooms(userId)
				]);

				return ownedRooms;
			},
			{ concurrency, failFast: true }
		);

		const allOwnedRooms = userCleanupResults.flat();

		if (allOwnedRooms.length > 0) {
			await runConcurrently(
				allOwnedRooms,
				async (room) => {
					await Promise.all([
					// Transfer ownership to admin user
						this.roomRepository.updatePartial(room.roomId, { owner: adminUserId }),
						this.recordingRepository.updateAccessScopeMetadataByRoomId(room.roomId, {
							roomOwner: adminUserId
						})
					]);
				},
				{ concurrency, failFast: true }
			);

			this.logger.info(
				`Transferred ownership of ${allOwnedRooms.length} room(s) from ${userIds.length} user(s) to admin '${adminUserId}'`
			);
		}

		this.logger.info(`Completed cleanup for ${userIds.length} user(s)`);
	}

	// Convert user to UserDTO to remove sensitive information
	convertToDTO(user: MeetUser): MeetUserDTO {
		const { passwordHash, mustChangePassword, ...userDTO } = user;
		void passwordHash;
		void mustChangePassword;
		return userDTO;
	}
}
