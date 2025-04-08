import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { Express } from 'express';
import { startTestServer, stopTestServer } from '../../../utils/server-setup.js';
import { Room } from 'livekit-server-sdk';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { LoggerService } from '../../../../src/services/logger.service.js';

const apiVersion = 'v1';
const baseUrl = `/meet/api/`;
const endpoint = '/rooms';

describe('Room Request Validation Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
	});

	afterAll(async () => {
		await stopTestServer();
	});

	it('✅ Should create a room with only required fields', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				autoDeletionDate: 1772129829000
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
	});

	it('✅ Should create a room with full attributes', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				autoDeletionDate: 1772129829000,
				roomNamePrefix: 'Conference',
				maxParticipants: 10,
				preferences: {
					recordingPreferences: { enabled: true },
					chatPreferences: { enabled: false },
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
	});

	it('✅ Should use default values for missing optional fields', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				autoDeletionDate: 1772129829000
			})
			.expect(200);

		expect(response.body).toHaveProperty('preferences');
		expect(response.body.preferences).toEqual({
			recordingPreferences: { enabled: true },
			chatPreferences: { enabled: true },
			virtualBackgroundPreferences: { enabled: true }
		});
	});

	it('❌ Should return 422 when missing autoDeletionDate', async () => {
		const response = await request(app).post(`${baseUrl}${apiVersion}${endpoint}`).send({}).expect(422);

		expect(response.body).toHaveProperty('error', 'Unprocessable Entity');
		expect(response.body.details[0].field).toBe('autoDeletionDate');
		expect(response.body.details[0].message).toContain('Required');
	});

	it('❌ Should return 422 when autoDeletionDate is in the past', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				autoDeletionDate: 1600000000000
			})
			.expect(422);

		expect(response.body.details[0].message).toContain('Expiration date must be in the future');
	});

	it('❌ Should return 422 when maxParticipants is negative', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				autoDeletionDate: 1772129829000,
				maxParticipants: -5
			})
			.expect(422);

		expect(response.body.details[0].field).toBe('maxParticipants');
		expect(response.body.details[0].message).toContain('Max participants must be a positive integer');
	});

	it('❌ Should return 422 when maxParticipants is not a number', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				autoDeletionDate: 1772129829000,
				maxParticipants: 'ten'
			})
			.expect(422);

		expect(response.body.details[0].message).toContain('Expected number, received string');
	});

	it('❌ Should return 422 when autoDeletionDate is not a number', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				autoDeletionDate: 'tomorrow'
			})
			.expect(422);

		expect(response.body.details[0].message).toContain('Expected number, received string');
	});

	it('❌ Should return 422 when preferences contain wrong types', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				autoDeletionDate: 1772129829000,
				preferences: {
					recordingPreferences: { enabled: 'yes' },
					chatPreferences: { enabled: 'no' }
				}
			})
			.expect(422);

		expect(response.body.details[0].message).toContain('Expected boolean, received string');
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
