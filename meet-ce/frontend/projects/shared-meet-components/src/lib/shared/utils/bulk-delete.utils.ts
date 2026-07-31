/**
 * Partial result carried by a bulk-delete HTTP error body: the backend deletes
 * what it can and reports both halves (`207`-style). `TFailed` is the
 * entity-specific failure shape (e.g. `{ recordingId, error }`).
 */
export interface BulkDeleteErrorDetails<TFailed> {
	/** Ids that were deleted despite the overall failure. Empty when the body is missing or malformed. */
	deleted: string[];
	/** Entries that could not be deleted. Empty when the body is missing or malformed. */
	failed: TFailed[];
}

/**
 * Safely extracts the partial bulk-delete result from an unknown error.
 *
 * Bulk-delete failures are not always structured: a 401, a 500 or a network
 * drop has no `error.deleted`/`error.failed` body. Reading those fields
 * unguarded used to throw a `TypeError` inside the `catch` block, silently
 * swallowing the user-facing error message — always parse through here.
 */
export const parseBulkDeleteError = <TFailed>(error: unknown): BulkDeleteErrorDetails<TFailed> => {
	const body = (error as { error?: { deleted?: unknown; failed?: unknown } } | null | undefined)?.error;

	return {
		deleted: Array.isArray(body?.deleted) ? (body.deleted as string[]) : [],
		failed: Array.isArray(body?.failed) ? (body.failed as TFailed[]) : []
	};
};
