import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { Express } from 'express';
import { startTestServer, stopTestServer } from '../../../utils/server-setup.js';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { LoggerService } from '../../../../src/services/logger.service.js';

const apiVersion = 'v1';
const baseUrl = `/embedded/api/`;
const endpoint = '/participant';
describe('Embedded Auth API Tests', () => {
	let app: Express;

	beforeAll(async () => {
		console.log('Server not started. Running in test mode.');
		app = await startTestServer();
	});

	afterAll(async () => {
		await stopTestServer();
	});

	it('✅ Should generate a embedded url with valid input', async () => {
		console.log;
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				participantName: 'OpenVidu',
				roomName: 'TestRoom'
			})
			.expect(200);

		expect(response.body).toHaveProperty('embeddedURL');
		expect(typeof response.body.embeddedURL).toBe('string');
	});

	it('✅ Should generate an embedded url with valid input and some permissions', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				participantName: 'OpenVidu',
				roomName: 'TestRoom',
				permissions: {
					canRecord: true,
					canChat: false
				}
			})
			.expect(200);

		expect(response.body).toHaveProperty('embeddedURL');
		expect(typeof response.body.embeddedURL).toBe('string');
	});

	it('❌ Should return 400 when missing participantName', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				roomName: 'TestRoom'
			})
			.expect(400);

		expect(response.body).toHaveProperty('errors');
		expect(response.body.errors[0].message).toContain("must have required property 'participantName'");
	});

	it('❌ Should return 400 when missing roomName', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				participantName: 'OpenVidu'
			})
			.expect(400);

		expect(response.body).toHaveProperty('errors');
		expect(response.body.errors[0].message).toContain("must have required property 'roomName'");
	});

	it('❌ Should return 400 when participantName has wrong type', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				participantName: 22,
				roomName: 'TestRoom'
			})
			.expect(400);

		expect(response.body).toHaveProperty('errors');
		expect(response.body.errors[0].message).toContain('must be string');
	});

	it('❌ Should return 400 when missing body request', async () => {
		const response = await request(app).post(`${baseUrl}${apiVersion}${endpoint}`).send().expect(415);

		expect(response.body).toHaveProperty('error');
		expect(response.body.error).toContain('Unsupported Media Type');
	});

	it('❌ Should return 500 when an error occurs in generateToken', async () => {
		jest.mock('../../../src/services/livekit.service');
		jest.mock('../../../src/services/logger.service');

		const mockLiveKitService = container.get(LiveKitService);
		mockLiveKitService.generateToken = jest
			.fn()
			.mockRejectedValue(new Error('LiveKit Error') as never) as jest.MockedFunction<
			(options: any) => Promise<string>
		>;
		// Mock the logger service
		const mockLoggerService = container.get(LoggerService);
		mockLoggerService.error = jest.fn();

		const response = await request(app).post(`${baseUrl}${apiVersion}${endpoint}`).send({
			participantName: 'testParticipant',
			roomName: 'testRoom'
		});

		// Assert: Check that the status is 500 and error message is correct
		expect(response.status).toBe(500);
		expect(response.body.error).toBe('Internal server error');
		expect(mockLoggerService.error).toHaveBeenCalledWith('Internal server error: Error: LiveKit Error');
	});

	it('❌ Should return 400 when permissions have wrong types', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.send({
				participantName: 'OpenVidu',
				roomName: 'TestRoom',
				permissions: {
					canRecord: 'yes', // Incorrect type
					canChat: true
				}
			})
			.expect(400);

		expect(response.body).toHaveProperty('errors');
		expect(response.body.errors[0].message).toContain('must be boolean');
	});

	it('❌ Should return 404 when requesting a non-existent API version (v2)', async () => {
		const response = await request(app)
			.post(`${baseUrl}v2${endpoint}`)
			.send({
				participantName: 'OpenVidu',
				roomName: 'TestRoom'
			})
			.expect(404);

		console.log(response.body);
		expect(response.body).toHaveProperty('error');
		expect(response.body.error).toBe('Not found');
	});

	it('❌ Should return 415 when unsupported content type is provided', async () => {
		const response = await request(app)
			.post(`${baseUrl}${apiVersion}${endpoint}`)
			.set('Content-Type', 'application/xml') // Unsupported content type
			.send('<xml><participantName>OpenVidu</participantName><roomName>TestRoom</roomName></xml>')
			.expect(415);

		expect(response.body).toHaveProperty('error');
		expect(response.body.error).toContain('Unsupported Media Type');
	});
});
