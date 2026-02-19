import { MeetRoomMemberPermissions } from '../database/room-member-permissions.js';
import { MeetRoomMemberRole } from '../database/room-member.entity.js';
import { SortAndPagination } from './sort-pagination.js';

/**
 * Filters for querying room members with pagination, sorting, and field selection support.
 */
export interface MeetRoomMemberFilters extends SortAndPagination {
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
