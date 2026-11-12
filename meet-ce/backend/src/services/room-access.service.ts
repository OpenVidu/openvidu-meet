import type { MeetRoomField, MeetRoomMemberPermissions, MeetUser, ProjectedMeetRoom } from '@openvidu-meet/typings';
import { MeetUserRole } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MeetRoomMemberHelper } from '../helpers/room-member.helper.js';
import { errorRoomNotFound } from '../models/error.model.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { WaitingRoomAdmissionPolicy } from './waiting-room/waiting-room-admission.policy.js';
import { RequestSessionService } from './request-session.service.js';

/**
 * The fields of a room that decide the permissions a user is granted in it.
 */
export const ROOM_ACCESS_FIELDS = ['roomId', 'owner', 'access', 'roles'] as const satisfies readonly MeetRoomField[];

export type RoomAccessFacts = ProjectedMeetRoom<typeof ROOM_ACCESS_FIELDS>;

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
		if (this.requestSessionService.getRoomIdFromMember() === roomId) {
			return this.getRoomMemberTokenPermissions(roomId);
		}

		return this.getGrantedRoomMemberPermissions(roomId);
	}

	/**
	 * The permissions the authenticated room member was granted in the room, which the waiting room never
	 * narrows: what the anonymous links they may share are measured against, so a moderator shares the room's
	 * links before joining as they do once joined, and a participant who waits never reads a link that lets
	 * its holder skip the waiting room they lack.
	 *
	 * @param roomId The ID of the room.
	 * @throws The `404` room not found error when an authenticated user asks about a room that does not exist
	 */
	async getGrantedRoomMemberPermissions(roomId: string): Promise<MeetRoomMemberPermissions> {
		const user = this.userWithRoomDependentPermissions();

		if (!user) {
			return this.roomIndependentPermissions(roomId);
		}

		const room = await this.roomRepository.findByRoomId(roomId, ROOM_ACCESS_FIELDS);

		if (!room) {
			throw errorRoomNotFound(roomId);
		}

		const [permissions] = await this.getUserPermissionsInRooms(user.userId, [room]);
		return permissions;
	}

	/**
	 * {@link getGrantedRoomMemberPermissions} for each of the given rooms, already read, with the memberships of the
	 * authenticated user in all of them read at once.
	 *
	 * @param rooms The rooms, carrying at least {@link ROOM_ACCESS_FIELDS}.
	 * @returns The permissions in each room, in the order of the rooms.
	 */
	async getGrantedRoomMemberPermissionsInRooms(
		rooms: readonly RoomAccessFacts[]
	): Promise<MeetRoomMemberPermissions[]> {
		const user = this.userWithRoomDependentPermissions();

		if (!user) {
			return rooms.map(({ roomId }) => this.roomIndependentPermissions(roomId));
		}

		return this.getUserPermissionsInRooms(user.userId, rooms);
	}

	/**
	 * The authenticated user of the current request when their permissions depend on the room: a user other than an
	 * admin, and no room member token.
	 */
	private userWithRoomDependentPermissions(): MeetUser | undefined {
		const user = this.requestSessionService.getAuthenticatedUser();

		if (this.requestSessionService.getRoomIdFromMember() || user?.role === MeetUserRole.ADMIN) {
			return undefined;
		}

		return user;
	}

	/**
	 * The permissions of a room member token in the room, or all of them for an admin or a system process (no
	 * authenticated user nor room member token).
	 */
	private roomIndependentPermissions(roomId: string): MeetRoomMemberPermissions {
		const memberRoomId = this.requestSessionService.getRoomIdFromMember();

		if (!memberRoomId) {
			return MeetRoomMemberHelper.allPermissions();
		}

		return memberRoomId === roomId
			? this.requestSessionService.getRoomMemberPermissions()!
			: MeetRoomMemberHelper.noPermissions();
	}

	/**
	 * All permissions in the rooms the user owns; elsewhere their membership's, or the speaker role's when the room
	 * lets users in without one.
	 */
	private async getUserPermissionsInRooms(
		userId: string,
		rooms: readonly RoomAccessFacts[]
	): Promise<MeetRoomMemberPermissions[]> {
		const notOwnedRoomIds = rooms.filter((room) => room.owner !== userId).map((room) => room.roomId);
		const memberships =
			notOwnedRoomIds.length > 0
				? await this.roomMemberRepository.findByMemberIdInRooms(userId, notOwnedRoomIds, [
						'roomId',
						'effectivePermissions'
					])
				: [];
		const membershipPermissions = new Map(
			memberships.map((member) => [member.roomId, member.effectivePermissions])
		);

		return rooms.map((room) => {
			if (room.owner === userId) {
				return MeetRoomMemberHelper.allPermissions();
			}

			return (
				membershipPermissions.get(room.roomId) ??
				(room.access.user.enabled ? room.roles.speaker.permissions : MeetRoomMemberHelper.noPermissions())
			);
		});
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
