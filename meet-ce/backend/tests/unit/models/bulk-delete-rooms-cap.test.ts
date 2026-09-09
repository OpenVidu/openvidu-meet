import { describe, expect, it } from '@jest/globals';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { BulkDeleteRoomsReqSchema } from '../../../src/models/zod-schemas/room.schema.js';

const roomIds = (count: number): string => Array.from({ length: count }, (_, i) => `room-${i}`).join(',');

const issueFor = (query: Record<string, unknown>): string | undefined => {
	const result = BulkDeleteRoomsReqSchema.safeParse(query);

	if (result.success) {
		return undefined;
	}

	return result.error.issues.find((issue) => issue.path.join('.') === 'roomIds')?.message;
};

describe('BulkDeleteRoomsReqSchema roomIds', () => {
	it('accepts as many ids as one request may delete', () => {
		expect(issueFor({ roomIds: roomIds(INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS) })).toBeUndefined();
	});

	it('rejects one id more, instead of letting the URL length be the limit', () => {
		expect(issueFor({ roomIds: roomIds(INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS + 1) })).toBe(
			`roomIds cannot exceed ${INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS} items`
		);
	});

	it('counts distinct ids only', () => {
		const duplicated = Array.from({ length: INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS + 50 }, () => 'same-room').join(
			','
		);

		expect(issueFor({ roomIds: duplicated })).toBeUndefined();
	});
});
