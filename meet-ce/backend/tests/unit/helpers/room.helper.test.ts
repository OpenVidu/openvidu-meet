import { describe, expect, it } from '@jest/globals';
import type { Room } from 'livekit-server-sdk';
import { MeetRoomHelper } from '../../../src/helpers/room.helper.js';

describe('MeetRoomHelper.meetingRemainingMs', () => {
	// LiveKit reports the room creation time in seconds
	const creationTimeSeconds = 1_700_000_000;
	const creationTimeMs = creationTimeSeconds * 1000;
	const room = (metadata?: string) => ({ creationTime: creationTimeSeconds, metadata }) as unknown as Room;

	describe('with the deadline in the room metadata', () => {
		const withEndDate = (endDate: number) =>
			room(JSON.stringify({ createdBy: 'openvidu-meet', endDate, roomOptions: {} }));

		it('should report the time left before the deadline', () => {
			const endDate = creationTimeMs + 60 * 60_000;

			expect(MeetRoomHelper.meetingRemainingMs(withEndDate(endDate), 60, creationTimeMs)).toBe(60 * 60_000);
			expect(MeetRoomHelper.meetingRemainingMs(withEndDate(endDate), 60, endDate - 5 * 60_000)).toBe(5 * 60_000);
		});

		it('should report zero exactly at the deadline', () => {
			const endDate = creationTimeMs + 60 * 60_000;

			expect(MeetRoomHelper.meetingRemainingMs(withEndDate(endDate), 60, endDate)).toBe(0);
		});

		it('should ignore the limit counted from the creation time', () => {
			// The clock starts when Meet creates the room, seconds before LiveKit stamps its own
			// creation time, so the two deadlines are close but not identical: the shared one wins.
			const endDate = creationTimeMs + 60 * 60_000 + 1_500;

			expect(MeetRoomHelper.meetingRemainingMs(withEndDate(endDate), 60, creationTimeMs)).toBe(
				60 * 60_000 + 1_500
			);
		});
	});

	describe('without a deadline in the room metadata', () => {
		it('should fall back to the limit counted from the creation time', () => {
			expect(MeetRoomHelper.meetingRemainingMs(room(), 60, creationTimeMs)).toBe(60 * 60_000);
			expect(MeetRoomHelper.meetingRemainingMs(room(), 60, creationTimeMs + 55 * 60_000)).toBe(5 * 60_000);
		});

		it('should report zero exactly at the deadline', () => {
			expect(MeetRoomHelper.meetingRemainingMs(room(), 60, creationTimeMs + 60 * 60_000)).toBe(0);
		});

		it('should report a negative value past the deadline', () => {
			expect(MeetRoomHelper.meetingRemainingMs(room(), 1, creationTimeMs + 2 * 60_000)).toBe(-60_000);
		});

		it('should fall back for a room LiveKit auto-created without metadata', () => {
			const autoCreated = room('');

			expect(MeetRoomHelper.meetingRemainingMs(autoCreated, 60, creationTimeMs)).toBe(60 * 60_000);
		});
	});
});
