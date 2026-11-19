import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { createApp } from '../../../../src/server.js';
import { errorInvalidApiKey, errorUnauthorized } from '../../../../src/models/error.model.js';
import { expectMeetError } from '../../../helpers/assertion-helpers.js';
import { deleteAllUsers, getFullPath, loginRootAdmin, startTestServer } from '../../../helpers/request-helpers.js';

const INFO_PATH = getFullPath('/info');

describe('System Info API Security Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
	});

	afterAll(async () => {
		await deleteAllUsers();
	});

	describe('Get System Info Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.get(INFO_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('version');
		});

		it('should fail when using access token', async () => {
			const { accessToken } = await loginRootAdmin();
			const response = await request(app).get(INFO_PATH).set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken);
			expectMeetError(response, errorUnauthorized());
		});

		it('should fail when request includes an invalid API key', async () => {
			const response = await request(app).get(INFO_PATH).set(INTERNAL_CONFIG.API_KEY_HEADER, 'invalid-key');
			expectMeetError(response, errorInvalidApiKey());
		});

		it('should fail when request is not authenticated', async () => {
			const response = await request(app).get(INFO_PATH);
			expectMeetError(response, errorUnauthorized());
		});
	});

	describe('Cross-origin requests', () => {
		const preflight = (server: Express, origin: string) =>
			request(server).options(INFO_PATH).set('Origin', origin).set('Access-Control-Request-Method', 'GET');

		it('should allow every origin by default', async () => {
			const response = await preflight(app, 'https://app.example.com');

			expect(response.headers['access-control-allow-origin']).toBe('*');
		});

		it('should answer only the configured origin when SERVER_CORS_ORIGIN restricts it', async () => {
			const configuredOrigin = MEET_ENV.SERVER_CORS_ORIGIN;
			MEET_ENV.SERVER_CORS_ORIGIN = 'https://app.example.com';

			try {
				const restrictedApp = createApp();
				const allowed = await preflight(restrictedApp, 'https://app.example.com');
				const other = await preflight(restrictedApp, 'https://other.example.com');

				expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');
				expect(other.headers['access-control-allow-origin']).not.toBe('https://other.example.com');
				expect(other.headers['access-control-allow-origin']).not.toBe('*');
			} finally {
				MEET_ENV.SERVER_CORS_ORIGIN = configuredOrigin;
			}
		});
	});
});
