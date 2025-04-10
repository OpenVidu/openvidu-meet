import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Express } from 'express';
import { deleteAllRooms, login, startTestServer, stopTestServer } from '../../../utils/helpers.js';
const apiVersion = 'v1';
const baseUrl = `/meet/api/`;
const endpoint = '/rooms';
describe('OpenVidu Meet Room API Tests', () => {
	let app: Express;
	let userCookie: string;
	const validAutoDeletionDate = Date.now() + 2 * 60 * 60 * 1000; // 2 hours ahead

	beforeAll(async () => {
		app = await startTestServer();
		userCookie = await login(app, 'user', 'user');
	});

	afterAll(async () => {
		// Remove all rooms created
		await deleteAllRooms(app);
		await stopTestServer();
	});

	describe('Room Creation Tests', () => {
		it('✅ Should create a room without autoDeletionDate (default behavior)', async () => {
			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send({
					roomIdPrefix: '   Test Room   '
				})
				.expect(200);

			expect(response.body).toHaveProperty('creationDate');
			expect(response.body).not.toHaveProperty('autoDeletionDate');
			expect(response.body.roomIdPrefix).toBe('TestRoom');
			expect(response.body).toHaveProperty('preferences');
			expect(response.body.preferences).toEqual({
				recordingPreferences: { enabled: true },
				chatPreferences: { enabled: true },
				virtualBackgroundPreferences: { enabled: true }
			});
			expect(response.body).toHaveProperty('moderatorRoomUrl');
			expect(response.body).toHaveProperty('publisherRoomUrl');
		});

		it('✅ Should create a room with a valid autoDeletionDate', async () => {
			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send({
					autoDeletionDate: validAutoDeletionDate,
					roomIdPrefix: '   My Room *123  '
				})
				.expect(200);

			expect(response.body).toHaveProperty('creationDate');
			expect(response.body).toHaveProperty('autoDeletionDate');
			expect(response.body.autoDeletionDate).toBe(validAutoDeletionDate);
			expect(response.body.roomIdPrefix).toBe('MyRoom123');
			expect(response.body).toHaveProperty('preferences');
			expect(response.body).toHaveProperty('moderatorRoomUrl');
			expect(response.body).toHaveProperty('publisherRoomUrl');
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

			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send(payload)
				.expect(200);

			expect(response.body).toHaveProperty('creationDate');
			expect(response.body).toHaveProperty('autoDeletionDate');
			expect(response.body.autoDeletionDate).toBe(validAutoDeletionDate);
			expect(response.body.roomIdPrefix).toBe('ExampleRoom');
			expect(response.body.preferences).toEqual({
				recordingPreferences: { enabled: false },
				chatPreferences: { enabled: false },
				virtualBackgroundPreferences: { enabled: true }
			});
			expect(response.body).toHaveProperty('moderatorRoomUrl');
			expect(response.body).toHaveProperty('publisherRoomUrl');
		});
	});

	describe('Room Creation Validation failures', () => {
		// Helper to get a valid autoDeletionDate (2 hours in the future)

		it('should fail when autoDeletionDate is negative', async () => {
			const payload = {
				autoDeletionDate: -5000,
				roomIdPrefix: 'TestRoom'
			};

			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send(payload)
				.expect(422);

			// Check that the error message contains the positive number validation
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('autoDeletionDate must be a positive integer');
		});

		it('should fail when autoDeletionDate is less than 1 hour in the future', async () => {
			const payload = {
				autoDeletionDate: Date.now() + 30 * 60 * 1000, // 30 minutes in the future
				roomIdPrefix: 'TestRoom'
			};

			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send(payload)
				.expect(422);

			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain(
				'autoDeletionDate must be at least 1 hour in the future'
			);
		});

		it('should fail when autoDeletionDate is not a number (string provided)', async () => {
			const payload = {
				autoDeletionDate: 'not-a-number',
				roomIdPrefix: 'TestRoom'
			};

			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected number');
		});

		it('should fail when autoDeletionDate is a boolean', async () => {
			const payload = {
				autoDeletionDate: true,
				roomIdPrefix: 'TestRoom'
			};

			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected number');
		});

		it('should fail when autoDeletionDate is omitted but provided as null', async () => {
			const payload = {
				autoDeletionDate: null,
				roomIdPrefix: 'TestRoom'
			};

			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected number');
		});

		it('should fail when roomIdPrefix is not a string (number provided)', async () => {
			const payload = {
				roomIdPrefix: 12345,
				autoDeletionDate: validAutoDeletionDate
			};

			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected string');
		});

		it('should fail when roomIdPrefix is a boolean', async () => {
			const payload = {
				roomIdPrefix: false,
				autoDeletionDate: validAutoDeletionDate
			};

			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected string');
		});

		it('should fail when preferences is not an object (string provided)', async () => {
			const payload = {
				roomIdPrefix: 'TestRoom',
				autoDeletionDate: validAutoDeletionDate,
				preferences: 'invalid-preferences'
			};

			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send(payload)
				.expect(422);

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

			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected boolean');
		});

		it('should fail with invalid JSON payload', async () => {
			// In this case, instead of sending JSON object, send an invalid JSON string.
			const response = await request(app)
				.post(`${baseUrl}${apiVersion}${endpoint}`)
				.set('Cookie', userCookie)
				.set('Content-Type', 'application/json')
				.send('{"roomIdPrefix": "TestRoom",') // invalid JSON syntax
				.expect(400);

			expect(response.body.error).toContain('Bad Request');
			expect(response.body.message).toContain('Malformed Body');
		});
	});
});
