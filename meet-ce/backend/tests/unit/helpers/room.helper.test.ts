import { describe, expect, it } from '@jest/globals';
import { MeetRoomHelper } from '../../../src/helpers/room.helper.js';

describe('MeetRoomHelper.meetingRemainingMs', () => {
	// LiveKit reports the room creation time in seconds
	const creationTimeSeconds = 1_700_000_000;
	const creationTimeMs = creationTimeSeconds * 1000;

	it('should report the time left before the deadline', () => {
		expect(MeetRoomHelper.meetingRemainingMs(creationTimeSeconds, 60, creationTimeMs)).toBe(60 * 60_000);
		expect(MeetRoomHelper.meetingRemainingMs(creationTimeSeconds, 60, creationTimeMs + 55 * 60_000)).toBe(
			5 * 60_000
		);
	});

	it('should report zero exactly at the deadline', () => {
		expect(MeetRoomHelper.meetingRemainingMs(creationTimeSeconds, 60, creationTimeMs + 60 * 60_000)).toBe(0);
	});

	it('should report a negative value past the deadline', () => {
		expect(MeetRoomHelper.meetingRemainingMs(creationTimeSeconds, 1, creationTimeMs + 2 * 60_000)).toBe(-60_000);
	});
});

describe('MeetRoomHelper.isMeetingOverMaxDuration', () => {
	// LiveKit reports the room creation time in seconds
	const creationTimeSeconds = 1_700_000_000;
	const creationTimeMs = creationTimeSeconds * 1000;

	it('should not consider a meeting over before its deadline', () => {
		expect(MeetRoomHelper.isMeetingOverMaxDuration(creationTimeSeconds, 60, creationTimeMs)).toBe(false);
		expect(MeetRoomHelper.isMeetingOverMaxDuration(creationTimeSeconds, 60, creationTimeMs + 59 * 60_000)).toBe(
			false
		);
	});

	it('should consider a meeting over exactly at its deadline', () => {
		expect(MeetRoomHelper.isMeetingOverMaxDuration(creationTimeSeconds, 60, creationTimeMs + 60 * 60_000)).toBe(
			true
		);
	});

	it('should consider a meeting over past its deadline', () => {
		expect(MeetRoomHelper.isMeetingOverMaxDuration(creationTimeSeconds, 1, creationTimeMs + 2 * 60_000)).toBe(true);
	});
});
