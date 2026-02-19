import { MeetRoomMemberPermissions } from '../database/room-member-permissions.js';
import { MeetRoomMemberRole } from '../database/room-member.entity.js';

/**
 * Options for adding a member to a room.
 */
export interface MeetRoomMemberOptions {
	/** Unique identifier for a registered Meet user (mutually exclusive with name) */
	userId?: string;
	/** Name for an external user (mutually exclusive with userId) */
	name?: string;
	/** The base role assigned to the member. See {@link MeetRoomMemberRole} for details. */
	baseRole: MeetRoomMemberRole;
	/** Custom permissions for the member (overrides base role permissions). See {@link MeetRoomMemberPermissions} for details. */
	customPermissions?: Partial<MeetRoomMemberPermissions>;
}

/**
 * Options for generating a room member token.
 * A room member token provides access to room resources (recordings, meetings, etc.)
 */
export interface MeetRoomMemberTokenOptions {
	/**
	 * A secret key for room access. Determines the member's role.
	 */
	secret?: string;
	/**
	 * Whether the token is intended for joining a meeting.
	 * If true, participantName must be provided.
	 */
	joinMeeting?: boolean;
	/**
	 * The name of the participant when joining the meeting.
	 * Required if joinMeeting is true.
	 */
	participantName?: string;
	/**
	 * The identity of the participant in the meeting.
	 * Required when refreshing an existing token used to join a meeting.
	 */
	participantIdentity?: string;
}
