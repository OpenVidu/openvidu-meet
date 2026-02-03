export interface SortAndPagination {
	maxItems?: number;
	nextPageToken?: string;
	sortField?: string;
	sortOrder?: 'asc' | 'desc';
}
