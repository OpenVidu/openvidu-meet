import { describe, it, beforeAll, afterAll, afterEach } from '@jest/globals';
import { createRoom, deleteAllRooms, getRooms, startTestServer, stopTestServer } from '../../../utils/helpers.js';
import ms from 'ms';
import {
	expectSuccessRoomsResponse,
	expectValidationError,
	expectValidRoom,
	expectValidRoomWithFields
} from '../../../utils/assertion-helpers.js';
import { MeetRoom } from '../../../../src/typings/ce/room.js';

describe('Room API Tests', () => {
	const validAutoDeletionDate = Date.now() + ms('2h');

	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await stopTestServer();
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
				roomIdPrefix: 'test-room'
			});

			const response = await getRooms();
			expectSuccessRoomsResponse(response, 1, 10, false, false);

			expectValidRoom(response.body.rooms[0], 'test-room');
		});

		it('should return a list of rooms applying fields filter', async () => {
			await createRoom({
				roomIdPrefix: 'test-room',
				autoDeletionDate: validAutoDeletionDate
			});

			const response = await getRooms({ fields: 'roomId,createdAt' });
			const { rooms } = response.body;

			expectSuccessRoomsResponse(response, 1, 10, false, false);

			expectValidRoomWithFields(rooms[0], ['roomId']);
		});

		it('should return a list of rooms with pagination', async () => {
			const promises = [0, 1, 2, 3, 4, 5].map((i) => {
				return createRoom({
					roomIdPrefix: `test-room-${i}`,
					autoDeletionDate: validAutoDeletionDate
				});
			});
			await Promise.all(promises);

			let response = await getRooms({ maxItems: 3 });
			let { pagination, rooms } = response.body;

			expectSuccessRoomsResponse(response, 3, 3, true, true);
			rooms.forEach((room: MeetRoom, i: number) => {
				expectValidRoom(room, `test-room-${i}`, validAutoDeletionDate);
			});

			const nextPageToken = pagination.nextPageToken;
			response = await getRooms({ maxItems: 3, nextPageToken });
			({ pagination, rooms } = response.body);
			expectSuccessRoomsResponse(response, 3, 3, false, false);
			rooms.forEach((room: MeetRoom, i: number) => {
				expectValidRoom(room, `test-room-${i + 3}`, validAutoDeletionDate);
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
