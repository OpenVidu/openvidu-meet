import { describe, expect, it } from '@jest/globals';
import { MeetRoomHelper } from '../../../src/helpers/room.helper.js';

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
