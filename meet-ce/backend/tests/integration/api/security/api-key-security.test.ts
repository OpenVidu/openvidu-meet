import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import {
	generateApiKey,
	loginAdminUser,
	restoreDefaultApiKeys,
	startTestServer
} from '../../../helpers/request-helpers.js';

const API_KEYS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/api-keys`;

describe('API Keys API Security Tests', () => {
	let app: Express;
	let adminAccessToken: string;

	beforeAll(async () => {
		app = await startTestServer();
		adminAccessToken = await loginAdminUser();
	});

	afterAll(async () => {
		await restoreDefaultApiKeys();
	});

	describe('Create API Key', () => {
		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.post(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(201);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).post(`${API_KEYS_PATH}`);
			expect(response.status).toBe(401);
		});
	});

	describe('Get API Keys', () => {
		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${API_KEYS_PATH}`);
			expect(response.status).toBe(401);
		});
	});

	describe('Delete API Keys', () => {
		beforeEach(async () => {
			// Create an API key to delete
			await generateApiKey();
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.delete(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(`${API_KEYS_PATH}`);
			expect(response.status).toBe(401);
		});
	});
});
