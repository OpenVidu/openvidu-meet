import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, jest, afterEach } from '@jest/globals';
import { Express } from 'express';
import { startTestServer, stopTestServer } from '../../../utils/server-setup.js';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { LoggerService } from '../../../../src/services/logger.service.js';
import { Room } from 'livekit-server-sdk';

const apiVersion = 'v1';
const baseUrl = `/meet/api/`;
const endpoint = '/rooms';
describe('OpenVidu Meet Room API Tests', () => {
	let app: Express;

	beforeAll(async () => {
		console.log('Server not started. Running in test mode.');
		app = await startTestServer();
	});

	afterEach(async () => {
		const rooms = await request(app).get(`${baseUrl}${apiVersion}${endpoint}`);

		for (const room of rooms.body) {
			console.log(`Deleting room ${room.roomName}`);
			await request(app).delete(`${baseUrl}${apiVersion}${endpoint}/${room.roomName}`);
		}
	});

	afterAll(async () => {
		await stopTestServer();
	});

	it('Should create a room', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				autoDeletionDate: 1772129829000,
				roomNamePrefix: 'OpenVidu',
				maxParticipants: 10,
				preferences: {
					chatPreferences: { enabled: true },
					recordingPreferences: { enabled: true },
					virtualBackgroundPreferences: { enabled: true }
				}
			})
			.expect(200);

		expect(response.body).toHaveProperty('creationDate');
		expect(response.body).toHaveProperty('autoDeletionDate');
		expect(response.body).toHaveProperty('maxParticipants');
		expect(response.body).toHaveProperty('preferences');
		expect(response.body).toHaveProperty('moderatorRoomUrl');
		expect(response.body).toHaveProperty('publisherRoomUrl');
		expect(response.body).toHaveProperty('viewerRoomUrl');
		expect(response.body).not.toHaveProperty('permissions');

		const room = await request(app).get(`${baseUrl}${apiVersion}${endpoint}/${response.body.roomName}`).expect(200);

		expect(room.body).toHaveProperty('creationDate');
		expect(room.body.roomName).toBe(response.body.roomName);
	});



	it('❌ Should return 500 when an internal server error occurs', async () => {
		jest.mock('../../../../src/services/livekit.service');
		jest.mock('../../../../src/services/logger.service');

		const mockLiveKitService = container.get(LiveKitService);
		mockLiveKitService.createRoom = jest.fn<() => Promise<Room>>().mockRejectedValue(new Error('LiveKit Error'));

		const mockLoggerService = container.get(LoggerService);
		mockLoggerService.error = jest.fn();

		const response = await request(app).post(`${baseUrl}${apiVersion}${endpoint}`).send({
			autoDeletionDate: 1772129829000,
			roomNamePrefix: 'OpenVidu'
		});

		expect(response.status).toBe(500);
		expect(response.body.message).toContain('Internal server error');
	});
});
