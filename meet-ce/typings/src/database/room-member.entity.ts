import { MeetRoomMemberPermissions } from './room-member-permissions.js';

/**
 * Represents a room member.
 * A member can be an internal user (identified by userId) or an external user (identified by name).
 */
export interface MeetRoomMember {
	/** Unique identifier for the member (equals userId for registered users, or generated for external users) */
	memberId: string;
	/** ID of the room the member belongs to */
	roomId: string;
	/** Name of the member (either registered or external user name) */
	name: string;
	/** Timestamp when the member was added to the room (milliseconds since epoch) */
	membershipDate: number;
	/** URL for the member to access the room */
	accessUrl: string;
	/** Base role of the member in the room. See {@link MeetRoomMemberRole} for details. */
	baseRole: MeetRoomMemberRole;
	/** Custom permissions for the member (if any). Overrides permissions from the base role. See {@link MeetRoomMemberPermissions} for details. */
	customPermissions?: Partial<MeetRoomMemberPermissions>;
	/** Effective permissions for the member, calculated from the base role and custom permissions. See {@link MeetRoomMemberPermissions} for details. */
	effectivePermissions: MeetRoomMemberPermissions;
	/** Timestamp when the member's effective permissions were last updated (milliseconds since epoch) */
	permissionsUpdatedAt: number;
}

/**
 * Represents the role of a member in a room.
 */
export enum MeetRoomMemberRole {
	MODERATOR = 'moderator',
	SPEAKER = 'speaker'
}
