import { beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { getFullPath, loginUser, startTestServer } from '../../../helpers/request-helpers.js';

const ANALYTICS_PATH = getFullPath(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/analytics`);

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
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(ANALYTICS_PATH)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(ANALYTICS_PATH);
			expect(response.status).toBe(401);
		});
	});
});
