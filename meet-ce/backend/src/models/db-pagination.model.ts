/**
 * Options for paginated find operations.
 */
export interface PaginatedFindOptions {
	maxItems?: number;
	nextPageToken?: string;
	sortField?: string;
	sortOrder?: 'asc' | 'desc';
}

/**
 * Result of a paginated find operation.
 */
export interface PaginatedResult<T> {
	items: T[];
	isTruncated: boolean;
	nextPageToken?: string;
}

/**
 * Pagination cursor structure.
 */
export interface PaginationCursor {
	fieldValue: unknown;
	id: string;
}
