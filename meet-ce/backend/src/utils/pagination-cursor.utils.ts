import type { PaginationCursor } from '../models/database.model.js';
import { errorInvalidPaginationToken } from '../models/error.model.js';

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

const isJsonPrimitive = (value: unknown): value is string | number | boolean | null =>
	value === null || ['string', 'number', 'boolean'].includes(typeof value);

/**
 * Encodes where a page ended (the sort field value and the _id of its last document) into the
 * opaque token the next request sends back as nextPageToken.
 */
export const encodePaginationCursor = (document: { _id: unknown }, sortField: string): string => {
	const fieldValue = (document as Record<string, unknown>)[sortField];
	const cursor: PaginationCursor = { fieldValue: fieldValue ?? null, id: String(document._id) };
	return Buffer.from(JSON.stringify(cursor)).toString('base64');
};

/**
 * Decodes a token minted by {@link encodePaginationCursor}. A token this API did not issue (a stale
 * bookmark, a truncated copy, a hand-built one) is the caller's mistake and is answered as such,
 * before a query operator can ride in as the sort field value or a malformed id can fail inside the
 * driver.
 */
export const decodePaginationCursor = (token: string): PaginationCursor => {
	let parsed: unknown;

	try {
		parsed = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
	} catch {
		throw errorInvalidPaginationToken();
	}

	if (typeof parsed !== 'object' || parsed === null || !('fieldValue' in parsed) || !('id' in parsed)) {
		throw errorInvalidPaginationToken();
	}

	const { fieldValue, id } = parsed;

	if (!isJsonPrimitive(fieldValue) || typeof id !== 'string' || !OBJECT_ID_PATTERN.test(id)) {
		throw errorInvalidPaginationToken();
	}

	return { fieldValue, id };
};
