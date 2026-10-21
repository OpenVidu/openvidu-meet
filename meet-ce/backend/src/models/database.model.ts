/**
 * Type for fields that exist only in the persistence document and not in the domain model.
 */
export type DocumentOnlyField<TDocument extends TDomain, TDomain> = Exclude<keyof TDocument, keyof TDomain>;

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

/**
 * Raised by the base repository write operations when the targeted document does not exist
 * (e.g. it was concurrently deleted between a read and the write).
 *
 * This is an expected, benign outcome — distinct from an infrastructure failure — so callers
 * classify it by type (`instanceof`) instead of matching on the error message. It is a
 * persistence-layer error and intentionally carries no HTTP status: translating it into a
 * domain `OpenViduMeetError` (e.g. a 404/409) is the service layer's responsibility.
 */
export class DocumentNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DocumentNotFoundError';
	}
}

/**
 * Raised by the base repository when a write collides with a unique index (MongoDB error code 11000),
 * e.g. a concurrent request created the same document first. Like {@link DocumentNotFoundError}, it carries
 * no HTTP status: the service layer translates it into a domain `OpenViduMeetError`.
 */
export class DuplicateKeyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DuplicateKeyError';
	}
}
