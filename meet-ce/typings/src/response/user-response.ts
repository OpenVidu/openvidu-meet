import { MeetUser, MeetUserRole } from '../database/user.entity.js';
import { SortAndPagination, SortableFieldKey } from './sort-pagination.js';

/**
 * Data Transfer Object (DTO) for MeetUser, excluding sensitive fields.
 */
export type MeetUserDTO = Omit<MeetUser, 'passwordHash' | 'mustChangePassword'>;

/**
 * User fields that are allowed for sorting in user list queries.
 */
export const MEET_USER_SORT_FIELDS = [
	'name',
	'registrationDate'
] as const satisfies readonly SortableFieldKey<MeetUser>[];

/**
 * Sortable user fields supported by user list queries.
 */
export type MeetUserSortField = (typeof MEET_USER_SORT_FIELDS)[number];

/**
 * Filters for querying Meet users, extending sorting and pagination options.
 */
export interface MeetUserFilters extends SortAndPagination<MeetUserSortField> {
	/** Optional filter by user ID (supports partial matches) */
	userId?: string;
	/** Optional filter by user name (supports partial matches) */
	name?: string;
	/** Optional filter by user role */
	role?: MeetUserRole;
}
