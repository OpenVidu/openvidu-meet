import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRecordingEncodingPreset, MeetRecordingLayout, MeetRoomDeletionSuccessCode } from '@openvidu-meet/typings';
import {
	expectSuccessRoomsResponse,
	expectValidRoom,
	expectValidRoomWithFields
} from '../../../helpers/assertion-helpers.js';
import {
	createRoom,
	deleteAllRooms,
	deleteRoom,
	getRoom,
	getRooms,
	startTestServer
} from '../../../helpers/request-helpers.js';

/**
 * X-Fields and X-ExtraFields headers on the room reads, where they combine with the query parameters
 * (union of unique fields). Each write operation covers its own headers next to its other tests.
 */
describe('Room Header Fields Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterEach(async () => {
		await deleteAllRooms();
	});

	describe('GET /rooms - X-Fields and X-ExtraFields headers', () => {
		it('should filter fields using X-Fields header', async () => {
			await createRoom({ roomName: 'header-fields-test' });

			const response = await getRooms({}, { xFields: 'roomId,roomName' });
			expectSuccessRoomsResponse(response, 1, 10, false, false);

			const room = response.body.rooms[0];
			expectValidRoomWithFields(room, ['roomId', 'roomName']);
		});

		it('should include extra fields using X-ExtraFields header', async () => {
			const customConfig = {
				recording: {
					enabled: true,
					layout: MeetRecordingLayout.SPEAKER,
					encoding: MeetRecordingEncodingPreset.H264_1080P_30
				},
				chat: { enabled: false },
				virtualBackground: { enabled: true },
				e2ee: { enabled: false },
				broadcast: {
					enabled: false,
					destinations: [],
					layout: MeetRecordingLayout.GRID,
					encoding: MeetRecordingEncodingPreset.H264_720P_30
				},
				captions: { enabled: true },
				raiseHand: { enabled: true },
				reactions: { enabled: true }
			};

			await createRoom({ roomName: 'header-extrafields-test', config: customConfig });

			const response = await getRooms({}, { xExtraFields: 'config' });
			expectSuccessRoomsResponse(response, 1, 10, false, false);

			const room = response.body.rooms[0];
			expectValidRoom(room, 'header-extrafields-test', {
				roomIdPrefix: 'header_extrafields_test',
				config: customConfig
			});
		});

		it('should combine X-Fields header with fields query param (union)', async () => {
			await createRoom({ roomName: 'merge-fields-test' });

			// Query param requests 'roomId', header requests 'roomName' → result should have both
			const response = await getRooms({ fields: 'roomId' }, { xFields: 'roomName' });
			expectSuccessRoomsResponse(response, 1, 10, false, false);

			const room = response.body.rooms[0];
			expectValidRoomWithFields(room, ['roomId', 'roomName']);
		});

		it('should combine X-ExtraFields header with extraFields query param (union)', async () => {
			await createRoom({ roomName: 'merge-extrafields-test' });

			// Both specify 'config' → result should contain config (deduplication)
			const response = await getRooms({ extraFields: 'config' }, { xExtraFields: 'config' });
			expectSuccessRoomsResponse(response, 1, 10, false, false);

			const room = response.body.rooms[0];
			expect(room.config).toBeDefined();
		});

		it('should combine query params and headers for both fields and extraFields', async () => {
			await createRoom({ roomName: 'full-merge-test' });

			// Query: fields=roomId, Header: X-Fields=roomName, X-ExtraFields=config
			const response = await getRooms({ fields: 'roomId' }, { xFields: 'roomName', xExtraFields: 'config' });
			expectSuccessRoomsResponse(response, 1, 10, false, false);

			const room = response.body.rooms[0];
			expectValidRoomWithFields(room, ['roomId', 'roomName', 'config']);
		});

		it('should work with only headers and no query params', async () => {
			await createRoom({ roomName: 'only-headers-test' });

			const response = await getRooms({}, { xFields: 'roomId,status', xExtraFields: 'config' });
			expectSuccessRoomsResponse(response, 1, 10, false, false);

			const room = response.body.rooms[0];
			expectValidRoomWithFields(room, ['roomId', 'status', 'config']);
		});

		it('should ignore invalid header values gracefully and fallback to query params', async () => {
			await createRoom({ roomName: 'invalid-header-test' });

			// Invalid header values should be silently ignored
			const response = await getRooms({ fields: 'roomId,roomName' }, { xFields: '' });
			expectSuccessRoomsResponse(response, 1, 10, false, false);

			const room = response.body.rooms[0];
			expectValidRoomWithFields(room, ['roomId', 'roomName']);
		});
	});

	describe('GET /rooms/:roomId - X-Fields and X-ExtraFields headers', () => {
		it('should filter fields using X-Fields header', async () => {
			const createdRoom = await createRoom({ roomName: 'get-room-header-test' });

			const response = await getRoom(createdRoom.roomId, undefined, undefined, undefined, {
				xFields: 'roomId,roomName'
			});

			expect(response.status).toBe(200);
			expectValidRoomWithFields(response.body, ['roomId', 'roomName']);
		});

		it('should include extra fields using X-ExtraFields header', async () => {
			const customConfig = {
				recording: {
					enabled: true,
					layout: MeetRecordingLayout.GRID,
					encoding: MeetRecordingEncodingPreset.H264_720P_30
				},
				chat: { enabled: true },
				virtualBackground: { enabled: true },
				e2ee: { enabled: false },
				broadcast: {
					enabled: false,
					destinations: [],
					layout: MeetRecordingLayout.GRID,
					encoding: MeetRecordingEncodingPreset.H264_720P_30
				},
				captions: { enabled: true },
				raiseHand: { enabled: true },
				reactions: { enabled: true }
			};

			const createdRoom = await createRoom({
				roomName: 'get-room-extrafields-header',
				config: customConfig
			});

			const response = await getRoom(createdRoom.roomId, undefined, undefined, undefined, {
				xExtraFields: 'config'
			});

			expect(response.status).toBe(200);
			expect(response.body.config).toBeDefined();
			expect(response.body.config).toMatchObject(customConfig);
		});

		it('should combine X-Fields header with fields query param', async () => {
			const createdRoom = await createRoom({ roomName: 'get-room-merge-test' });

			// Query param: fields=roomId, Header: X-Fields=status
			const response = await getRoom(createdRoom.roomId, 'roomId', undefined, undefined, {
				xFields: 'status'
			});

			expect(response.status).toBe(200);
			expectValidRoomWithFields(response.body, ['roomId', 'status']);
		});

		it('should combine X-ExtraFields header with extraFields query param', async () => {
			const createdRoom = await createRoom({ roomName: 'get-room-merge-extra' });

			// Both specify 'config' via different mechanisms
			const response = await getRoom(createdRoom.roomId, undefined, 'config', undefined, {
				xExtraFields: 'config'
			});

			expect(response.status).toBe(200);
			expect(response.body.config).toBeDefined();
		});

		it('should work with both X-Fields and X-ExtraFields headers together', async () => {
			const createdRoom = await createRoom({ roomName: 'get-room-both-headers' });

			const response = await getRoom(createdRoom.roomId, undefined, undefined, undefined, {
				xFields: 'roomId,roomName',
				xExtraFields: 'config'
			});

			expect(response.status).toBe(200);
			expectValidRoomWithFields(response.body, ['roomId', 'roomName', 'config']);
		});
	});

	describe('DELETE /rooms/:roomId - X-Fields and X-ExtraFields headers', () => {
		it('should not affect response when room is not returned (direct deletion)', async () => {
			const { roomId } = await createRoom();

			// Direct deletion (no meeting, no recordings) → no room in response
			const response = await deleteRoom(roomId, {}, { xFields: 'roomId' });

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('successCode', MeetRoomDeletionSuccessCode.ROOM_DELETED);
			expect(response.body).not.toHaveProperty('room');
		});
	});
});
