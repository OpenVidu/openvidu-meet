import { describe, expect, it } from '@jest/globals';
import type { MeetRoom } from '@openvidu-meet/typings';
import { MeetRoomHelper } from '../../../src/helpers/room.helper.js';

// What `RoomService.createLivekitRoom` sends to LiveKit, and what the extractors below read back.
describe('MeetRoomHelper.toLivekitRoomMetadata', () => {
	const nowMs = Date.UTC(2026, 8, 3, 12, 0, 0);
	const meetRoom = (maxDurationMinutes?: number) =>
		({
			roomName: 'Weekly sync',
			config: { maxDurationMinutes },
			roles: [],
			access: {
				anonymous: {
					moderator: { enabled: true },
					speaker: { enabled: true },
					recording: { enabled: false }
				},
				user: { enabled: true }
			}
		}) as unknown as MeetRoom;

	it('writes the deadline of the meeting the room creation starts', () => {
		const metadata = MeetRoomHelper.toLivekitRoomMetadata(meetRoom(30), nowMs);

		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata(metadata)).toBe(nowMs + 30 * 60_000);
	});

	it('writes no deadline for a room that does not limit the meeting duration', () => {
		const metadata = MeetRoomHelper.toLivekitRoomMetadata(meetRoom(), nowMs);

		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata(metadata)).toBeUndefined();
	});

	it('marks the room as created by Meet and carries its options', () => {
		const metadata = MeetRoomHelper.toLivekitRoomMetadata(meetRoom(30), nowMs);

		expect(MeetRoomHelper.checkIfMeetingBelogsToOpenViduMeet(metadata)).toBe(true);
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata(metadata)?.roomName).toBe('Weekly sync');
	});
});

// `extractRoomOptionsFromMetadata` is what lets the participant webhooks read the room name straight
// off the LiveKit event instead of querying MongoDB on every join and leave. A silent `undefined`
// here does not break anything visibly — it just falls back to the database — so the happy path and
// every rejection path are pinned down here.
describe('MeetRoomHelper.extractRoomOptionsFromMetadata', () => {
	// Mirrors what RoomService.createLivekitRoom writes into the LiveKit room metadata.
	const meetMetadata = (roomOptions: unknown): string => JSON.stringify({ createdBy: 'openvidu-meet', roomOptions });

	it('extracts the room options written by Meet at room creation', () => {
		const metadata = meetMetadata({ roomName: 'Weekly sync', config: { chat: { enabled: true } } });

		expect(MeetRoomHelper.extractRoomOptionsFromMetadata(metadata)).toEqual({
			roomName: 'Weekly sync',
			config: { chat: { enabled: true } }
		});
	});

	it('returns undefined when there is no metadata at all', () => {
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata(undefined)).toBeUndefined();
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata('')).toBeUndefined();
	});

	it('returns undefined when the metadata is not valid JSON', () => {
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata('not json at all')).toBeUndefined();
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata('{"roomOptions":')).toBeUndefined();
	});

	it('returns undefined when the metadata does not carry room options', () => {
		// A LiveKit room created outside Meet, or a Meet room whose metadata predates roomOptions.
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata('{"createdBy":"openvidu-meet"}')).toBeUndefined();
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata('{}')).toBeUndefined();
	});

	it('returns undefined when the metadata is valid JSON but not an object', () => {
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata('null')).toBeUndefined();
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata('42')).toBeUndefined();
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata('"a string"')).toBeUndefined();
	});

	it('returns undefined when roomOptions is present but not an object', () => {
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata(meetMetadata(null))).toBeUndefined();
		expect(MeetRoomHelper.extractRoomOptionsFromMetadata(meetMetadata('Weekly sync'))).toBeUndefined();
	});
});

// `endDate` is the deadline the backend enforces and every participant counts down to, read straight
// off the LiveKit room metadata. Anything it cannot trust must read as absent, so the enforcement
// falls back to the limit counted from the room creation time instead of trusting a bad value.
describe('MeetRoomHelper.extractMeetingEndDateFromMetadata', () => {
	// Mirrors what RoomService.createLivekitRoom writes into the LiveKit room metadata.
	const meetMetadata = (endDate: unknown): string =>
		JSON.stringify({ createdBy: 'openvidu-meet', endDate, roomOptions: {} });

	it('extracts the deadline written by Meet at room creation', () => {
		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata(meetMetadata(1_700_003_600_000))).toBe(
			1_700_003_600_000
		);
	});

	it('returns undefined when the metadata carries no deadline', () => {
		// A room whose Meet room declares no duration limit, so the key is left out entirely.
		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata(meetMetadata(undefined))).toBeUndefined();
		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata('{"createdBy":"openvidu-meet"}')).toBeUndefined();
	});

	it('returns undefined when there is no metadata at all', () => {
		// A room LiveKit auto-created because the configured one had already expired.
		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata(undefined)).toBeUndefined();
		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata('')).toBeUndefined();
	});

	it('returns undefined when the metadata is not valid JSON', () => {
		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata('not json at all')).toBeUndefined();
		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata('{"endDate":')).toBeUndefined();
	});

	it('returns undefined when the deadline is not a number', () => {
		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata(meetMetadata('1700003600000'))).toBeUndefined();
		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata(meetMetadata(null))).toBeUndefined();
	});

	it('returns undefined for a deadline JSON widens to Infinity', () => {
		// Metadata is writable through the LiveKit API by anyone holding its keys, and an infinite
		// deadline would be a meeting no limit ever ends.
		expect(MeetRoomHelper.extractMeetingEndDateFromMetadata('{"endDate":1e999}')).toBeUndefined();
	});
});
