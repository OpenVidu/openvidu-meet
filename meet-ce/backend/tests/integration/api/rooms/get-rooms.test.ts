import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRecordingEncodingPreset, MeetRecordingLayout, MeetRoom, MeetRoomStatus } from '@openvidu-meet/typings';
import ms from 'ms';
import {
	expectExtraFieldsInResponse,
	expectSuccessRoomsResponse,
	expectValidationError,
	expectValidRoom,
	expectValidRoomWithFields
} from '../../../helpers/assertion-helpers.js';
import { createRoom, deleteAllRooms, getRooms, startTestServer } from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	const validAutoDeletionDate = Date.now() + ms('2h');

	beforeAll(async () => {
		await startTestServer();
	});

	afterEach(async () => {
		// Remove all rooms created
		await deleteAllRooms();
	});

	describe('List Rooms Tests', () => {
		it('should return an empty list of rooms', async () => {
			const response = await getRooms();

			expectSuccessRoomsResponse(response, 0, 10, false, false);
		});

		it('should return a list of rooms', async () => {
			await createRoom({
				roomName: 'test-room'
			});

			const response = await getRooms();
			expectSuccessRoomsResponse(response, 1, 10, false, false);
			expectValidRoom(response.body.rooms[0], 'test-room', 'test_room');
			expectExtraFieldsInResponse(response.body);
		});

		it('should return a list of rooms applying fields filter', async () => {
			await createRoom({
				roomName: 'test-room',
				autoDeletionDate: validAutoDeletionDate
			});

			const response = await getRooms({ fields: 'roomId,creationDate' });
			const { rooms } = response.body;

			expectSuccessRoomsResponse(response, 1, 10, false, false);

			expectValidRoomWithFields(rooms[0], ['roomId', 'creationDate']);
			expectExtraFieldsInResponse(response.body);
		});

		it('should return a list of rooms applying roomName filter', async () => {
			await Promise.all([
				createRoom({
					roomName: 'test-room'
				}),
				createRoom({
					roomName: 'other-room'
				})
			]);

			const response = await getRooms({ roomName: 'test-room' });
			const { rooms } = response.body;

			expectSuccessRoomsResponse(response, 1, 10, false, false);
			expectValidRoom(rooms[0], 'test-room');
			expectExtraFieldsInResponse(response.body);
		});

		it('should return a list of rooms applying status filter', async () => {
			await Promise.all([
				setupSingleRoom(true), // Active meeting
				setupSingleRoom(false) // Open
			]);

			const response = await getRooms({ status: MeetRoomStatus.ACTIVE_MEETING });
			const { rooms } = response.body;

			expectSuccessRoomsResponse(response, 1, 10, false, false);
			expect(rooms[0].status).toBe(MeetRoomStatus.ACTIVE_MEETING);
		});

		it('should return a list of rooms with pagination', async () => {
			const promises = [];

			// Create rooms sequentially to ensure different creation dates
			for (let i = 0; i < 6; i++) {
				promises.push(
					createRoom({
						roomName: `test-room-${i}`,
						autoDeletionDate: validAutoDeletionDate
					})
				);
			}

			await Promise.all(promises);

			let response = await getRooms({ maxItems: 3, sortField: 'roomName', sortOrder: 'desc' });
			let { pagination, rooms } = response.body;

			expectSuccessRoomsResponse(response, 3, 3, true, true);
			// Rooms are ordered by creation date descending (newest first)
			rooms.forEach((room: MeetRoom, i: number) => {
				expectValidRoom(room, `test-room-${5 - i}`, undefined, undefined, validAutoDeletionDate);
			});

			const nextPageToken = pagination.nextPageToken;
			response = await getRooms({ maxItems: 3, sortField: 'roomName', sortOrder: 'desc', nextPageToken });
			({ pagination, rooms } = response.body);
			expectSuccessRoomsResponse(response, 3, 3, false, false);
			rooms.forEach((room: MeetRoom, i: number) => {
				expectValidRoom(room, `test-room-${2 - i}`, undefined, undefined, validAutoDeletionDate);
			});
		});

		it('should capped maxItems to the maximum allowed', async () => {
			const response = await getRooms({ maxItems: 101 });

			expectSuccessRoomsResponse(response, 0, 100, false, false);
		});

		it('should coerce a floating number to an integer for maxItems', async () => {
			const response = await getRooms({ maxItems: 12.78 });

			expectSuccessRoomsResponse(response, 0, 12, false, false);
		});

		it('should sort rooms by roomName ascending and descending', async () => {
			await Promise.all([
				createRoom({ roomName: 'zebra-room' }),
				createRoom({ roomName: 'alpha-room' }),
				createRoom({ roomName: 'beta-room' })
			]);

			// Test ascending
			let response = await getRooms({ sortField: 'roomName', sortOrder: 'asc' });
			let rooms = response.body.rooms;

			expectSuccessRoomsResponse(response, 3, 10, false, false);
			expectValidRoom(rooms[0], 'alpha-room');
			expectValidRoom(rooms[1], 'beta-room');
			expectValidRoom(rooms[2], 'zebra-room');

			// Test descending
			response = await getRooms({ sortField: 'roomName', sortOrder: 'desc' });
			rooms = response.body.rooms;

			expectSuccessRoomsResponse(response, 3, 10, false, false);
			expectValidRoom(rooms[0], 'zebra-room');
			expectValidRoom(rooms[1], 'beta-room');
			expectValidRoom(rooms[2], 'alpha-room');
		});

		it('should sort rooms by creationDate ascending and descending', async () => {
			const room1 = await createRoom({ roomName: 'first-room' });
			const room2 = await createRoom({ roomName: 'second-room' });
			const room3 = await createRoom({ roomName: 'third-room' });

			// Test ascending
			let response = await getRooms({ sortField: 'creationDate', sortOrder: 'asc' });
			let rooms = response.body.rooms;

			expectSuccessRoomsResponse(response, 3, 10, false, false);
			expectValidRoom(rooms[0], room1.roomName);
			expectValidRoom(rooms[1], room2.roomName);
			expectValidRoom(rooms[2], room3.roomName);

			// Test descending (default)
			response = await getRooms({ sortField: 'creationDate', sortOrder: 'desc' });
			rooms = response.body.rooms;

			expectSuccessRoomsResponse(response, 3, 10, false, false);
			expectValidRoom(rooms[0], room3.roomName);
			expectValidRoom(rooms[1], room2.roomName);
			expectValidRoom(rooms[2], room1.roomName);
		});

		it('should sort rooms by autoDeletionDate ascending and descending', async () => {
			const now = Date.now();
			const date1 = now + ms('2h');
			const date2 = now + ms('3h');

			await Promise.all([
				createRoom({ roomName: 'room-3h', autoDeletionDate: date2 }),
				createRoom({ roomName: 'room-2h', autoDeletionDate: date1 }),
				createRoom({ roomName: 'room-without-date' }) // Room without autoDeletionDate
			]);

			// Test ascending
			let response = await getRooms({ sortField: 'autoDeletionDate', sortOrder: 'asc' });
			let rooms = response.body.rooms;

			expectSuccessRoomsResponse(response, 3, 10, false, false);
			expectValidRoom(rooms[0], 'room-without-date', undefined, undefined, undefined);
			expectValidRoom(rooms[1], 'room-2h', undefined, undefined, date1);
			expectValidRoom(rooms[2], 'room-3h', undefined, undefined, date2);

			// Test descending
			response = await getRooms({ sortField: 'autoDeletionDate', sortOrder: 'desc' });
			rooms = response.body.rooms;

			expectSuccessRoomsResponse(response, 3, 10, false, false);
			expectValidRoom(rooms[0], 'room-3h', undefined, undefined, date2);
			expectValidRoom(rooms[1], 'room-2h', undefined, undefined, date1);
			expectValidRoom(rooms[2], 'room-without-date', undefined, undefined, undefined);
		});
	});

	describe('List Room Validation failures', () => {
		it('should fail when maxItems is not a number', async () => {
			const response = await getRooms({ maxItems: 'not-a-number' });
			expectValidationError(response, 'maxItems', 'Expected number, received nan');
		});

		it('should fail when maxItems is negative', async () => {
			const response = await getRooms({ maxItems: -1 });
			expectValidationError(response, 'maxItems', 'must be a positive number');
		});

		it('should fail when maxItems is zero', async () => {
			const response = await getRooms({ maxItems: 0 });
			expectValidationError(response, 'maxItems', 'must be a positive number');
		});

		it('should fail when fields is not a string', async () => {
			const response = await getRooms({ fields: { invalid: 'data' } });
			expectValidationError(response, 'fields', 'Expected string');
		});

		it('should fail when sortField is invalid', async () => {
			const response = await getRooms({ sortField: 'invalidField' });
			expectValidationError(response, 'sortField', 'Invalid enum value');
		});

		it('should fail when sortOrder is invalid', async () => {
			const response = await getRooms({ sortOrder: 'invalid' });
			expectValidationError(response, 'sortOrder', 'Invalid enum value');
		});

		it('should fail when status is invalid', async () => {
			const response = await getRooms({ status: 'invalid_status' });
			expectValidationError(response, 'status', 'Invalid enum value');
		});
	});

	describe('List Rooms with ExtraFields Parameter Tests', () => {
		it('should return rooms without config when extraFields parameter is not provided', async () => {
			await createRoom({
				roomName: 'no-extrafields-list-test'
			});

			const response = await getRooms();
			expectSuccessRoomsResponse(response, 1, 10, false, false);

			const room = response.body.rooms[0];
			expectValidRoom(room, 'no-extrafields-list-test', 'no_extrafields_list_test');
		});

		it('should return rooms with full config when using extraFields=config', async () => {
			const customConfig = {
				recording: {
					enabled: false,
					layout: MeetRecordingLayout.SPEAKER,
					encoding: MeetRecordingEncodingPreset.H264_1080P_30
				},
				chat: { enabled: false },
				virtualBackground: { enabled: false },
				e2ee: { enabled: true },
				captions: { enabled: false }
			};

			await createRoom({
				roomName: 'extrafields-list-test',
				config: customConfig
			});

			const response = await getRooms({ extraFields: 'config' });
			expectSuccessRoomsResponse(response, 1, 10, false, false);

			const room = response.body.rooms[0];
			expectValidRoom(room, 'extrafields-list-test', 'extrafields_list_test', customConfig);
		});

		it('should not fail when extraFields has invalid values', async () => {
			await createRoom({
				roomName: 'invalid-extrafields-list'
			});

			const response = await getRooms({ extraFields: 'invalid,wrongparam' });
			expectSuccessRoomsResponse(response, 1, 10, false, false);

			expectValidRoom(response.body.rooms[0], 'invalid-extrafields-list', 'invalid_extrafields_list');
		});

		it('should return multiple rooms with full config when using extraFields=config', async () => {
			const config1 = {
				recording: {
					enabled: true,
					layout: MeetRecordingLayout.GRID,
					encoding: MeetRecordingEncodingPreset.H264_720P_30
				},
				chat: { enabled: true },
				virtualBackground: { enabled: true },
				e2ee: { enabled: false },
				captions: { enabled: true }
			};

			const config2 = {
				recording: {
					enabled: false,
					layout: MeetRecordingLayout.SPEAKER,
					encoding: MeetRecordingEncodingPreset.H264_1080P_30
				},
				chat: { enabled: false },
				virtualBackground: { enabled: false },
				e2ee: { enabled: true },
				captions: { enabled: false }
			};

			await Promise.all([
				createRoom({ roomName: 'multi-extrafields-1', config: config1 }),
				createRoom({ roomName: 'multi-extrafields-2', config: config2 })
			]);

			const response = await getRooms({ extraFields: 'config' });
			expectSuccessRoomsResponse(response, 2, 10, false, false);

			const rooms = response.body.rooms;
			const room1 = rooms.find((r: MeetRoom) => r.roomName === 'multi-extrafields-1');
			const room2 = rooms.find((r: MeetRoom) => r.roomName === 'multi-extrafields-2');

			expect(room1).toBeDefined();
			expect(room2).toBeDefined();

			expectValidRoom(room1, 'multi-extrafields-1', 'multi_extrafields_1', config1);
			expectValidRoom(room2, 'multi-extrafields-2', 'multi_extrafields_2', config2);
		});
	});
});
