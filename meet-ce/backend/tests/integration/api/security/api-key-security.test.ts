import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { deleteAllUsers, generateApiKey, restoreDefaultApiKeys, startTestServer } from '../../../helpers/request-helpers.js';
import { setupTestUsers } from '../../../helpers/test-scenarios.js';
import { TestUsers } from '../../../interfaces/scenarios.js';

const API_KEYS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/api-keys`;

describe('API Keys API Security Tests', () => {
	let app: Express;
	let testUsers: TestUsers;

	beforeAll(async () => {
		app = await startTestServer();
		testUsers = await setupTestUsers();
	});

	afterAll(async () => {
		await restoreDefaultApiKeys();
		await deleteAllUsers();
	});

	describe('Create API Key', () => {
		it('should succeed when user is authenticated as ADMIN', async () => {
			const response = await request(app)
				.post(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expect(response.status).toBe(201);
		});

		it('should fail when user is authenticated as USER', async () => {
			const response = await request(app)
				.post(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER', async () => {
			const response = await request(app)
				.post(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).post(`${API_KEYS_PATH}`);
			expect(response.status).toBe(401);
		});
	});

	describe('Get API Keys', () => {
		it('should succeed when user is authenticated as ADMIN', async () => {
			const response = await request(app)
				.get(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as USER', async () => {
			const response = await request(app)
				.get(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER', async () => {
			const response = await request(app)
				.get(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
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

		it('should succeed when user is authenticated as ADMIN', async () => {
			const response = await request(app)
				.delete(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as USER', async () => {
			const response = await request(app)
				.delete(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER', async () => {
			const response = await request(app)
				.delete(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(`${API_KEYS_PATH}`);
			expect(response.status).toBe(401);
		});
	});
});
