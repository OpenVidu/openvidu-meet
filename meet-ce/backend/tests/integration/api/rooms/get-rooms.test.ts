import { afterEach, beforeAll, describe, it } from '@jest/globals';
import ms from 'ms';
import { MeetRoom } from '@openvidu-meet/typings';
import {
	expectSuccessRoomsResponse,
	expectValidationError,
	expectValidRoom,
	expectValidRoomWithFields
} from '../../../helpers/assertion-helpers.js';
import { createRoom, deleteAllRooms, getRooms, startTestServer } from '../../../helpers/request-helpers.js';

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

			expectValidRoom(response.body.rooms[0], 'test-room');
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
		});

		it('should return a list of rooms applying roomName filter', async () => {
			await createRoom({
				roomName: 'test-room'
			});
			await createRoom({
				roomName: 'other-room'
			});

			const response = await getRooms({ roomName: 'test-room' });
			const { rooms } = response.body;

			expectSuccessRoomsResponse(response, 1, 10, false, false);
			expectValidRoom(rooms[0], 'test-room');
		});

		it('should return a list of rooms with pagination', async () => {
			// Create rooms sequentially to ensure different creation dates
			for (let i = 0; i < 6; i++) {
				await createRoom({
					roomName: `test-room-${i}`,
					autoDeletionDate: validAutoDeletionDate
				});
			}

			let response = await getRooms({ maxItems: 3 });
			let { pagination, rooms } = response.body;

			expectSuccessRoomsResponse(response, 3, 3, true, true);
			// Rooms are ordered by creation date descending (newest first)
			rooms.forEach((room: MeetRoom, i: number) => {
				expectValidRoom(room, `test-room-${5 - i}`, undefined, undefined, validAutoDeletionDate);
			});

			const nextPageToken = pagination.nextPageToken;
			response = await getRooms({ maxItems: 3, nextPageToken });
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
	});
});
