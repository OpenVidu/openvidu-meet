/**
 * Supported sorting directions for list responses.
 */
export enum SortOrder {
	/**
	 * Sorts results in ascending order.
	 */
	ASC = 'asc',
	/**
	 * Sorts results in descending order.
	 */
	DESC = 'desc'
}

/**
 * Common sorting and pagination options for list responses.
 */
export interface SortAndPagination {
	/**
	 * Maximum number of items to include in the current page.
	 */
	maxItems?: number;
	/**
	 * Token used to request the next page of results.
	 */
	nextPageToken?: string;
	/**
	 * Field name used to sort the result list.
	 */
	sortField?: string;
	/**
	 * Sorting direction applied to the result list.
	 */
	sortOrder?: SortOrder;
}
