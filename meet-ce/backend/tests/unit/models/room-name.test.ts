import { describe, expect, it } from '@jest/globals';
import { RoomOptionsSchema } from '../../../src/models/zod-schemas/room.schema.js';

const roomNameFor = (options: Record<string, unknown>): string => {
	const result = RoomOptionsSchema.parse(options) as { roomName: string };
	return result.roomName;
};

describe('RoomOptionsSchema roomName', () => {
	it('keeps a provided name, collapsing its whitespace', () => {
		expect(roomNameFor({ roomName: '  My   Room  ' })).toBe('My Room');
	});

	it('falls back to the default name when none is provided', () => {
		expect(roomNameFor({})).toBe('Room');
		expect(roomNameFor({ roomName: null })).toBe('Room');
	});

	it('falls back to the default name when the name is empty or only whitespace', () => {
		expect(roomNameFor({ roomName: '' })).toBe('Room');
		expect(roomNameFor({ roomName: '   ' })).toBe('Room');
		expect(roomNameFor({ roomName: '\t\n' })).toBe('Room');
	});

	it('rejects a name longer than 50 characters', () => {
		const result = RoomOptionsSchema.safeParse({ roomName: 'a'.repeat(51) });

		expect(result.success).toBe(false);
	});
});
