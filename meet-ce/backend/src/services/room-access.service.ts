import type { MeetRoomMemberPermissions, MeetUser } from '@openvidu-meet/typings';
import { MeetUserRole } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MeetRoomMemberHelper } from '../helpers/room-member.helper.js';
import { errorRoomNotFound } from '../models/error.model.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { WaitingRoomAdmissionPolicy } from './waiting-room/waiting-room-admission.policy.js';
import { RequestSessionService } from './request-session.service.js';

/**
 * Decides what the principal of the current request may do in a room.
 */
@injectable()
export class RoomAccessService {
	constructor(
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(RoomMemberRepository) protected roomMemberRepository: RoomMemberRepository,
		@inject(RequestSessionService) protected requestSessionService: RequestSessionService,
		@inject(WaitingRoomAdmissionPolicy) protected waitingRoomAdmissionPolicy: WaitingRoomAdmissionPolicy
	) {}

	/**
	 * Retrieves the permissions of the authenticated room member.
	 *
	 * - If the user is authenticated via room member token, their permissions are obtained from the token metadata,
	 * narrowed by {@link WaitingRoomAdmissionPolicy.permissionsOf} for a token without participant identity in a room with
	 * the waiting room on.
	 * - If the user is admin or the room owner, they have all permissions.
	 * - If the user is a room member, their permissions are obtained from their room member info.
	 * - If the user is authenticated but not a room member, permissions depend on whether user access is enabled
	 * (speaker permissions if enabled, no permissions if not).
	 * - If there's no authenticated user nor room member token, returns all permissions.
	 * This is necessary for methods invoked by system processes (e.g., room auto-deletion).
	 *
	 * @param roomId The ID of the room.
	 * @returns A promise that resolves to the MeetRoomMemberPermissions object.
	 * @throws The `404` room not found error when an authenticated user asks about a room that does not exist
	 */
	async getAuthenticatedRoomMemberPermissions(roomId: string): Promise<MeetRoomMemberPermissions> {
		const user = this.requestSessionService.getAuthenticatedUser();
		const memberRoomId = this.requestSessionService.getRoomIdFromMember();

		// Room member token
		if (memberRoomId) {
			if (memberRoomId !== roomId) {
				return MeetRoomMemberHelper.noPermissions();
			}

			return this.getRoomMemberTokenPermissions(roomId);
		}

		// Authenticated user
		if (user) {
			if (user.role === MeetUserRole.ADMIN) {
				return MeetRoomMemberHelper.allPermissions();
			}

			const room = await this.roomRepository.findByRoomId(roomId, ['owner', 'access', 'roles']);

			if (!room) {
				throw errorRoomNotFound(roomId);
			}

			if (room.owner === user.userId) {
				return MeetRoomMemberHelper.allPermissions();
			}

			// Get permissions for room members
			const member = await this.roomMemberRepository.findByRoomAndMemberId(roomId, user.userId, [
				'effectivePermissions'
			]);

			if (member) {
				return member.effectivePermissions;
			}

			// If not a room member, check if user access is enabled to determine if we should return speaker permissions or no permissions
			if (room.access.user.enabled) {
				return room.roles.speaker.permissions;
			}

			return MeetRoomMemberHelper.noPermissions();
		}

		// No authenticated user nor room member token - return all permissions for system processes
		return MeetRoomMemberHelper.allPermissions();
	}

	/**
	 * The permissions of the room member token of the current request in its own room.
	 *
	 * @throws The `404` room not found error
	 */
	protected async getRoomMemberTokenPermissions(roomId: string): Promise<MeetRoomMemberPermissions> {
		const room =
			this.requestSessionService.getRoom(roomId) ?? (await this.roomRepository.findByRoomId(roomId, ['config']));

		if (!room) {
			throw errorRoomNotFound(roomId);
		}

		return this.waitingRoomAdmissionPolicy.permissionsOf(
			room.config,
			this.requestSessionService.getRoomMemberPermissions()!,
			this.requestSessionService.getParticipantIdentity()
		);
	}

	/**
	 * Checks if a user can access a specific room based on their role.
	 *
	 * @param roomId The ID of the room to check access for.
	 * @param user The user object containing user details and role.
	 * @returns A promise that resolves to true if the user can access the room, false otherwise.
	 * @throws The `404` room not found error when the room does not exist
	 */
	async canUserAccessRoom(roomId: string, user: MeetUser): Promise<boolean> {
		const room = await this.roomRepository.findByRoomId(roomId, ['owner', 'access']);

		if (!room) {
			throw errorRoomNotFound(roomId);
		}

		if (user.role === MeetUserRole.ADMIN) {
			// Admins can access all rooms
			return true;
		}

		if (room.access.user.enabled) {
			// Users can access rooms with user access enabled
			return true;
		}

		// Users can access rooms they own or are members of
		if (room.owner === user.userId) {
			return true;
		}

		const member = await this.roomMemberRepository.findByRoomAndMemberId(roomId, user.userId, ['memberId']);
		return !!member;
	}
}
