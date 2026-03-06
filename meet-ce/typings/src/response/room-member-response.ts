import { MeetRoomMemberPermissions } from '../database/room-member-permissions.js';
import { MeetRoomMember } from '../database/room-member.entity.js';
import { SortAndPagination, SortableFieldKey } from './sort-pagination.js';

/**
 * List of all valid fields that can be selected from a MeetRoomMember.
 * IMPORTANT: Update this list if new properties are added to the MeetRoomMember interface.
 */
export const MEET_ROOM_MEMBER_FIELDS = [
	'memberId',
	'roomId',
	'name',
	'membershipDate',
	'accessUrl',
	'baseRole',
	'customPermissions',
	'effectivePermissions',
	'permissionsUpdatedAt'
] as const satisfies readonly (keyof MeetRoomMember)[];

/**
 * Properties of a {@link MeetRoomMember} that can be included in the API response when fields filtering is applied.
 */
export type MeetRoomMemberField = (typeof MEET_ROOM_MEMBER_FIELDS)[number];

/**
 * Room member fields that are allowed for sorting in room member list queries.
 */
export const MEET_ROOM_MEMBER_SORT_FIELDS = [
	'name',
	'membershipDate'
] as const satisfies readonly SortableFieldKey<MeetRoomMember>[];

/**
 * Sortable room member fields supported by room member list queries.
 */
export type MeetRoomMemberSortField = (typeof MEET_ROOM_MEMBER_SORT_FIELDS)[number];

/**
 * Filters for querying room members with pagination, sorting, and field selection support.
 */
export interface MeetRoomMemberFilters extends SortAndPagination<MeetRoomMemberSortField> {
	/** Filter by member name (partial match) */
	name?: string;
	/** Array of fields to include in the response */
	fields?: MeetRoomMemberField[];
}

/**
 * Metadata stored in room member tokens.
 * Contains information about the room and member permissions.
 */
export interface MeetRoomMemberTokenMetadata {
	/** Token issued at timestamp (milliseconds since epoch) */
	iat: number;
	/** Unique identifier for the room */
	roomId: string;
	/** Unique identifier for the member if defined */
	memberId?: string;
	/** Unique identifier for the user if defined */
	userId?: string;
	/** Effective permissions for the member. */
	permissions: MeetRoomMemberPermissions;
	/** Visual badge/category used in participant UI. */
	badge: MeetRoomMemberUIBadge;
	/** Indicates if participant has been promoted to moderator during the meeting and is not originally a moderator. */
	isPromotedModerator?: boolean;
	/** URL of the LiveKit server to connect to when joining the meeting */
	livekitUrl?: string;
}

/**
 * UI badge/category for room members, used to visually distinguish roles in the participant list and other UI elements.
 */
export enum MeetRoomMemberUIBadge {
	/** Owner badge, typically for the creator of the room */
	OWNER = 'owner',
	/** Admin badge, typically for users with administrative privileges */
	ADMIN = 'admin',
	/** Moderator badge, typically for users with moderation privileges */
	MODERATOR = 'moderator',
	/** Other badge, typically for regular participants without special privileges */
	OTHER = 'other'
}
