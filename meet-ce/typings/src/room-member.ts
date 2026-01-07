import { MeetRoomMemberPermissions } from './permissions/meet-permissions.js';
import { SortAndPagination } from './sort-pagination.js';

/**
 * Options for adding a member to a room.
 */
export interface MeetRoomMemberOptions {
    userId?: string; // userId of an internal Meet user (mutually exclusive with name)
    name?: string; // Name for an external user (mutually exclusive with userId)
    baseRole: MeetRoomMemberRole; // The base role assigned to the member
    customPermissions?: Partial<MeetRoomMemberPermissions>; // Custom permissions for the member (overrides base role permissions)
}

/**
 * Represents a room member.
 * A member can be an internal user (identified by userId) or an external user (identified by name).
 */
export interface MeetRoomMember {
    memberId: string; // Unique identifier for the member (equals userId for internal users, or generated for external users)
    roomId: string; // ID of the room the member belongs to
    name: string; // Name of the member (either internal or external user name)
    membershipDate: number; // Timestamp when the member was added to the room
    baseRole: MeetRoomMemberRole; // The base role of the member in the room
    customPermissions?: Partial<MeetRoomMemberPermissions>; // Custom permissions for the member (if any)
    effectivePermissions: MeetRoomMemberPermissions; // Effective permissions for the member (base role + custom permissions)
}

/**
 * Represents the role of a member in a room.
 */
export enum MeetRoomMemberRole {
    MODERATOR = 'moderator',
    SPEAKER = 'speaker'
}

export interface MeetRoomMemberFilters extends SortAndPagination {
    name?: string;
    fields?: string;
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

/**
 * Metadata stored in room member tokens.
 * Contains information about the room and member permissions.
 */
export interface MeetRoomMemberTokenMetadata {
    livekitUrl: string;
    roomId: string;
    memberId?: string;
    baseRole: MeetRoomMemberRole;
    customPermissions?: Partial<MeetRoomMemberPermissions>;
    effectivePermissions: MeetRoomMemberPermissions;
}
