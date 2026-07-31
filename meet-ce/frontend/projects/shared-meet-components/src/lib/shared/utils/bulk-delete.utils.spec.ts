import { parseBulkDeleteError } from './bulk-delete.utils';

/**
 * The parser exists because bulk-delete failures are not always structured:
 * before it, reading `error.error.deleted` unguarded threw a TypeError inside
 * the catch block on a 401/500/network failure, and the user saw no message.
 */
describe('parseBulkDeleteError', () => {
	it('extracts the partial result from a structured bulk-delete error', () => {
		const error = {
			error: {
				deleted: ['id-1', 'id-2'],
				failed: [{ recordingId: 'id-3', error: 'in_use' }]
			}
		};

		expect(parseBulkDeleteError(error)).toEqual({
			deleted: ['id-1', 'id-2'],
			failed: [{ recordingId: 'id-3', error: 'in_use' }]
		});
	});

	it('returns empty halves for unstructured failures (network error, plain Error)', () => {
		expect(parseBulkDeleteError(new Error('fetch failed'))).toEqual({ deleted: [], failed: [] });
		expect(parseBulkDeleteError(undefined)).toEqual({ deleted: [], failed: [] });
		expect(parseBulkDeleteError(null)).toEqual({ deleted: [], failed: [] });
		expect(parseBulkDeleteError('boom')).toEqual({ deleted: [], failed: [] });
	});

	it('returns empty halves for an error body without the bulk-delete fields (401/500 payloads)', () => {
		expect(parseBulkDeleteError({ error: { message: 'Unauthorized' } })).toEqual({ deleted: [], failed: [] });
	});

	it('discards malformed halves without dropping the valid one', () => {
		expect(parseBulkDeleteError({ error: { deleted: 'not-an-array', failed: [{ userId: 'u1' }] } })).toEqual({
			deleted: [],
			failed: [{ userId: 'u1' }]
		});
	});
});
