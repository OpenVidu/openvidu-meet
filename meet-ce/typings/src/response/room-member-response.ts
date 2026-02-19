import { MeetRoomMemberPermissions } from '../database/room-member-permissions.js';
import { MeetRoomMember, MeetRoomMemberRole } from '../database/room-member.entity.js';
import { SortAndPagination, SortableFieldKey } from './sort-pagination.js';

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
	/** Comma-separated list of fields to include in the response (e.g., "userId,name,baseRole") */
	fields?: string;
}

/**
 * Metadata stored in room member tokens.
 * Contains information about the room and member permissions.
 */
export interface MeetRoomMemberTokenMetadata {
	/** Token issued at timestamp (milliseconds since epoch) */
	iat: number;
	/** URL of the LiveKit server to connect to */
	livekitUrl: string;
	/** Unique identifier for the room */
	roomId: string;
	/** Unique identifier for the member if defined */
	memberId?: string;
	/** Base role assigned to the member. See {@link MeetRoomMemberRole} for details. */
	baseRole: MeetRoomMemberRole;
	/** Custom permissions for the member (overrides base role permissions). See {@link MeetRoomMemberPermissions} for details. */
	customPermissions?: Partial<MeetRoomMemberPermissions>;
	/** Effective permissions for the member (combination of base role and custom permissions). See {@link MeetRoomMemberPermissions} for details. */
	effectivePermissions: MeetRoomMemberPermissions;
}
