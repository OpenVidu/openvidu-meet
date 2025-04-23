import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Express } from 'express';
import {
	createRoom,
	deleteAllRooms,
	loginUserAsRole,
	startTestServer,
	stopTestServer
} from '../../../utils/helpers.js';
import { UserRole } from '../../../../src/typings/ce/user.js';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import ms from 'ms';
import { expectValidRoom } from '../../../utils/assertion-helpers.js';

const ROOMS_PATH = `${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`;

describe('Room API Tests', () => {
	const validAutoDeletionDate = Date.now() + ms('2h');

	let app: Express;
	let userCookie: string;

	beforeAll(async () => {
		app = await startTestServer();
		userCookie = await loginUserAsRole(UserRole.USER);
	});

	afterAll(async () => {
		await deleteAllRooms();
		await stopTestServer();
	});

	describe('Room Creation Tests', () => {
		it('✅ Should create a room without autoDeletionDate (default behavior)', async () => {
			const room = await createRoom({
				roomIdPrefix: '   Test Room   '
			});
			expectValidRoom(room, 'TestRoom');
		});

		it('✅ Should create a room with a valid autoDeletionDate', async () => {
			const room = await createRoom({
				autoDeletionDate: validAutoDeletionDate,
				roomIdPrefix: '   .,-------}{¡$#<+My Room *123  '
			});

			expectValidRoom(room, 'MyRoom123', validAutoDeletionDate);
		});

		it('✅ Should create a room when sending full valid payload', async () => {
			const payload = {
				roomIdPrefix: ' =Example Room&/ ',
				autoDeletionDate: validAutoDeletionDate,
				preferences: {
					recordingPreferences: { enabled: false },
					chatPreferences: { enabled: false },
					virtualBackgroundPreferences: { enabled: true }
				}
			};

			const room = await createRoom(payload);

			expectValidRoom(room, 'ExampleRoom', validAutoDeletionDate, payload.preferences);
		});
	});

	describe('Room Creation Validation failures', () => {
		it('should fail when autoDeletionDate is negative', async () => {
			const payload = {
				autoDeletionDate: -5000,
				roomIdPrefix: 'TestRoom'
			};

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send(payload).expect(422);

			// Check that the error message contains the positive number validation
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('autoDeletionDate must be a positive integer');
		});

		it('should fail when autoDeletionDate is less than 1 hour in the future', async () => {
			const payload = {
				autoDeletionDate: Date.now() + ms('30m'),
				roomIdPrefix: 'TestRoom'
			};

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send(payload).expect(422);

			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain(
				`autoDeletionDate must be at least ${INTERNAL_CONFIG.MIN_FUTURE_TIME_FOR_ROOM_AUTODELETION_DATE} in the future`
			);
		});

		it('should fail when autoDeletionDate is not a number (string provided)', async () => {
			const payload = {
				autoDeletionDate: 'not-a-number',
				roomIdPrefix: 'TestRoom'
			};

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send(payload).expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected number');
		});

		it('should fail when autoDeletionDate is a boolean', async () => {
			const payload = {
				autoDeletionDate: true,
				roomIdPrefix: 'TestRoom'
			};

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send(payload).expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected number');
		});

		it('should fail when autoDeletionDate is omitted but provided as null', async () => {
			const payload = {
				autoDeletionDate: null,
				roomIdPrefix: 'TestRoom'
			};

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send(payload).expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected number');
		});

		it('should fail when roomIdPrefix is not a string (number provided)', async () => {
			const payload = {
				roomIdPrefix: 12345,
				autoDeletionDate: validAutoDeletionDate
			};

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send(payload).expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected string');
		});

		it('should fail when roomIdPrefix is a boolean', async () => {
			const payload = {
				roomIdPrefix: false,
				autoDeletionDate: validAutoDeletionDate
			};

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send(payload).expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected string');
		});

		it('should fail when preferences is not an object (string provided)', async () => {
			const payload = {
				roomIdPrefix: 'TestRoom',
				autoDeletionDate: validAutoDeletionDate,
				preferences: 'invalid-preferences'
			};

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send(payload).expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected object');
		});

		it('should fail when preferences has an invalid structure', async () => {
			// Assuming preferences expects each sub-property to be an object with a boolean "enabled",
			// here we deliberately use an invalid structure.
			const payload = {
				roomIdPrefix: 'TestRoom',
				autoDeletionDate: validAutoDeletionDate,
				preferences: {
					recordingPreferences: { enabled: 'yes' }, // invalid boolean
					chatPreferences: { enabled: true },
					virtualBackgroundPreferences: { enabled: true }
				}
			};

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send(payload).expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected boolean');
		});

		it('should fail with invalid JSON payload', async () => {
			// In this case, instead of sending JSON object, send an invalid JSON string.
			const response = await request(app)
				.post(ROOMS_PATH)
				.set('Cookie', userCookie)
				.set('Content-Type', 'application/json')
				.send('{"roomIdPrefix": "TestRoom",') // invalid JSON syntax
				.expect(400);

			expect(response.body.error).toContain('Bad Request');
			expect(response.body.message).toContain('Malformed Body');
		});

		it('should fail when roomIdPrefix is too long', async () => {
			const longRoomId = 'a'.repeat(51);
			const payload = {
				roomIdPrefix: longRoomId,
				autoDeletionDate: validAutoDeletionDate
			};

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send(payload).expect(422);

			expect(JSON.stringify(response.body.details)).toContain('roomIdPrefix cannot exceed 50 characters');
		});
	});
});
