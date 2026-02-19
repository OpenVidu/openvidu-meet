import { MeetUser, MeetUserRole } from '../database/user.entity.js';
import { SortAndPagination } from './sort-pagination.js';

/**
 * Data Transfer Object (DTO) for MeetUser, excluding sensitive fields.
 */
export type MeetUserDTO = Omit<MeetUser, 'passwordHash' | 'mustChangePassword'>;

/**
 * Filters for querying Meet users, extending sorting and pagination options.
 */
export interface MeetUserFilters extends SortAndPagination {
	/** Optional filter by user ID (supports partial matches) */
	userId?: string;
	/** Optional filter by user name (supports partial matches) */
	name?: string;
	/** Optional filter by user role */
	role?: MeetUserRole;
}
