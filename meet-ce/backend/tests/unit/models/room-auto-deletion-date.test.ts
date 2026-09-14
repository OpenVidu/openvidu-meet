import { describe, expect, it } from '@jest/globals';
import ms from 'ms';
import { RoomOptionsSchema } from '../../../src/models/zod-schemas/room.schema.js';

const issueFor = (autoDeletionDate: number): string | undefined => {
	const result = RoomOptionsSchema.safeParse({ roomName: 'bounded', autoDeletionDate });

	if (result.success) {
		return undefined;
	}

	return result.error.issues.find((issue) => issue.path.join('.') === 'autoDeletionDate')?.message;
};

describe('RoomOptionsSchema autoDeletionDate', () => {
	const latestRepresentableDate = 8_640_000_000_000_000;

	it('accepts a date within the range a Date can represent', () => {
		expect(issueFor(Date.now() + ms('2h'))).toBeUndefined();
		expect(issueFor(latestRepresentableDate)).toBeUndefined();
	});

	it('rejects a timestamp no Date can represent instead of storing an Invalid Date', () => {
		expect(issueFor(latestRepresentableDate + 1)).toBe(
			'autoDeletionDate must be a valid timestamp in milliseconds'
		);
		expect(issueFor(1e308)).toBe('autoDeletionDate must be a valid timestamp in milliseconds');
	});

	it('keeps rejecting a date less than an hour ahead', () => {
		expect(issueFor(Date.now() + ms('30m'))).toBe('autoDeletionDate must be at least 1h in the future');
	});
});
