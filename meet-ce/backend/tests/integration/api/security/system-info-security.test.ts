import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
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
			expect(response.status).toBe(401);
		});

		it('should fail when request includes an invalid API key', async () => {
			const response = await request(app).get(INFO_PATH).set(INTERNAL_CONFIG.API_KEY_HEADER, 'invalid-key');
			expect(response.status).toBe(401);
		});

		it('should fail when request is not authenticated', async () => {
			const response = await request(app).get(INFO_PATH);
			expect(response.status).toBe(401);
		});
	});
});
