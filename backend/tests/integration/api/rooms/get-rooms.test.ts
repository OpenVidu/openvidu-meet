import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { Express } from 'express';
import {
	createRoom,
	deleteAllRooms,
	assertEmptyRooms,
	getRooms,
	startTestServer,
	stopTestServer,
	assertRoomsResponse
} from '../../../utils/helpers.js';
import { MEET_API_BASE_PATH_V1, MEET_API_KEY } from '../../../../src/environment.js';

const endpoint = '/rooms';
describe('OpenVidu Meet Room API Tests', () => {
	let app: Express;
	const validAutoDeletionDate = Date.now() + 2 * 60 * 60 * 1000; // 2 hours ahead

	beforeAll(async () => {
		app = await startTestServer();
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
			await assertEmptyRooms();
		});

		it('should return a list of rooms', async () => {
			await assertEmptyRooms();

			await createRoom({
				roomIdPrefix: 'test-room'
			});

			const body = await getRooms();
			const { rooms } = body;

			assertRoomsResponse(body, 1, 10, false, false);
			expect(rooms[0].roomId).toBeDefined();
			expect(rooms[0].roomId).toContain('test-room');
			expect(rooms[0].creationDate).toBeDefined();
			expect(rooms[0].roomIdPrefix).toBeDefined();
			expect(rooms[0].autoDeletionDate).not.toBeDefined();
			expect(rooms[0].preferences).toBeDefined();
			expect(rooms[0].moderatorRoomUrl).toBeDefined();
			expect(rooms[0].publisherRoomUrl).toBeDefined();
		});

		it('should return a list of rooms applying fields filter', async () => {
			await assertEmptyRooms();

			await createRoom({
				roomIdPrefix: 'test-room',
				autoDeletionDate: validAutoDeletionDate
			});

			const body = await getRooms({ fields: 'roomId,createdAt' });
			const { rooms } = body;

			assertRoomsResponse(body, 1, 10, false, false);

			expect(rooms[0].roomId).toBeDefined();
			expect(rooms[0].roomId).toContain('test-room');

			expect(rooms[0].creationDate).not.toBeDefined();
			expect(rooms[0].roomIdPrefix).not.toBeDefined();
			//CreatedAt does not exist in the room
			expect(rooms[0].createdAt).not.toBeDefined();
			expect(rooms[0].autoDeletionDate).not.toBeDefined();
			expect(rooms[0].preferences).not.toBeDefined();
			expect(rooms[0].moderatorRoomUrl).not.toBeDefined();
			expect(rooms[0].publisherRoomUrl).not.toBeDefined();
		});

		it('should return a list of rooms with pagination', async () => {
			await assertEmptyRooms();
			const promises = [1, 2, 3, 4, 5, 6].map((i) => {
				return createRoom({
					roomIdPrefix: `test-room-${i}`,
					autoDeletionDate: validAutoDeletionDate
				});
			});
			await Promise.all(promises);

			let body = await getRooms({ maxItems: 3 });
			const { pagination } = body;

			assertRoomsResponse(body, 3, 3, true, true);

			const nextPageToken = pagination.nextPageToken;
			body = await getRooms({ maxItems: 3, nextPageToken });

			assertRoomsResponse(body, 3, 3, false, false);
		});

		it('should capped maxItems to the maximum allowed', async () => {
			const body = await getRooms({ maxItems: 101 });

			assertRoomsResponse(body, 0, 100, false, false);
		});

		it('should coerce a floating number to an integer for maxItems', async () => {
			const body = await getRooms({ maxItems: 12.78 });

			assertRoomsResponse(body, 0, 12, false, false);
		});
	});

	describe('List Room Validation failures', () => {
		it('should fail when maxItems is not a number', async () => {
			const response = await request(app)
				.get(`${MEET_API_BASE_PATH_V1}${endpoint}`)
				.set('X-API-KEY', MEET_API_KEY)
				.query({ maxItems: 'not-a-number' })
				.expect(422);

			expect(response.body.error).toContain('Unprocessable Entity');
			// Check that the error details mention an invalid number.
			expect(JSON.stringify(response.body.details)).toContain('Expected number, received nan');
		});

		it('should fail when maxItems is negative', async () => {
			const response = await request(app)
				.get(`${MEET_API_BASE_PATH_V1}${endpoint}`)
				.set('X-API-KEY', MEET_API_KEY)
				.query({ maxItems: -1 })
				.expect(422);

			console.log(response.body);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('positive number');
		});

		it('should fail when maxItems is zero', async () => {
			const response = await request(app)
				.get(`${MEET_API_BASE_PATH_V1}${endpoint}`)
				.set('X-API-KEY', MEET_API_KEY)
				.query({ maxItems: 0 })
				.expect(422);

			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('positive number');
		});

		it('should fail when fields is not a string', async () => {
			const response = await request(app)
				.get(`${MEET_API_BASE_PATH_V1}${endpoint}`)
				.set('X-API-KEY', MEET_API_KEY)
				.query({ fields: { invalid: 'data' } })
				.expect(422);

			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('Expected string');
		});
	});
});
