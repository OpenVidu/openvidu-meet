import { MeetRoomMemberPermissions } from './room-member-permissions.js';

/**
 * Represents a room member.
 * A member can be a user (identified by userId) or an identified guest (identified by name).
 */
export interface MeetRoomMember {
	/**
	 * Unique identifier for the member (equals userId for users, or generated with a `guest-` prefix for identified guests).
	 * It is also the participant identity in meetings, so it never grants access: an identified guest's link is {@link MeetRoomMember.accessUrl}.
	 */
	memberId: string;
	/** ID of the room the member belongs to */
	roomId: string;
	/** Type of the member (user or identified guest). See {@link MeetRoomMemberType} for details. */
	type: MeetRoomMemberType;
	/** Name of the member (either user or identified guest name) */
	name: string;
	/** Timestamp when the member was added to the room (milliseconds since epoch) */
	membershipDate: number;
	/**
	 * URL for the member to access the room. For an identified guest it is their personal link, whose `secret`
	 * is the `memberId`, a hyphen and a random part; guests added before 3.10.0 keep a link whose `secret` is
	 * their `memberId`, deprecated until 3.13.0.
	 */
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

/**
 * Represents the type of a member in a room.
 */
export enum MeetRoomMemberType {
	/** A user, linked to a Meet user account. */
	USER = 'user',
	/** An identified guest, not linked to any Meet user account. */
	IDENTIFIED_GUEST = 'identified_guest'
}

/**
 * How a participant asked to join a room with a waiting room, derived by the server from the credential
 * of the request.
 */
export enum MeetWaitingRoomParticipantType {
	/** The participant asked with their own Meet user account */
	USER = 'user',
	/** The participant asked with the personal link of an identified guest */
	IDENTIFIED_GUEST = 'identified_guest',
	/** The participant asked with a shared link of the room, so they are anonymous */
	ANONYMOUS = 'anonymous'
}
