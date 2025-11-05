import { beforeAll, describe, expect, it } from '@jest/globals';
import { AuthTransportMode } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_INITIAL_API_KEY } from '../../../../src/environment.js';
import { changeAuthTransportMode, loginUser, startTestServer } from '../../../helpers/request-helpers.js';

const ANALYTICS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/analytics`;

describe('Analytics API Security Tests', () => {
	let app: Express;
	let adminAccessToken: string;

	beforeAll(async () => {
		app = await startTestServer();
		adminAccessToken = await loginUser();
	});

	describe('Get Analytics Tests', () => {
		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.get(ANALYTICS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(ANALYTICS_PATH)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin and token is sent in cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login again to get token in cookie
			const newAdminAccessToken = await loginUser();

			const response = await request(app).get(ANALYTICS_PATH).set('Cookie', newAdminAccessToken);
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(ANALYTICS_PATH);
			expect(response.status).toBe(401);
		});
	});
});
