import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import {
	generateApiKey,
	getApiKeys,
	loginRootAdmin,
	restoreDefaultApiKeys,
	startTestServer
} from '../../../helpers/request-helpers.js';

const API_KEYS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/api-keys`;

describe('API Keys API Tests', () => {
	let app: Express;
	let rootAdminAccessToken: string;

	beforeAll(async () => {
		app = await startTestServer();
		({ accessToken: rootAdminAccessToken } = await loginRootAdmin());
	});

	afterAll(async () => {
		await restoreDefaultApiKeys();
	});

	const getRoomsWithApiKey = async (apiKey: string) => {
		return request(app)
			.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
			.set(INTERNAL_CONFIG.API_KEY_HEADER, apiKey);
	};

	describe('Create API Key', () => {
		it('should create a new API key', async () => {
			const response = await request(app)
				.post(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, rootAdminAccessToken)
				.expect(201);

			expect(response.body).toHaveProperty('key');
			expect(response.body).toHaveProperty('creationDate');
			expect(response.body.key).toMatch(/^ovmeet-/);

			// Verify the API key works by making a request to the get rooms endpoint
			// using the newly created API key
			const apiResponse = await getRoomsWithApiKey(response.body.key);
			expect(apiResponse.status).toBe(200);
		});

		it('should only exist one API key at a time', async () => {
			const apiKey1 = await generateApiKey();
			const apiKey2 = await generateApiKey();
			const response = await getApiKeys();

			expect(response.body.length).toBe(1);
			expect(response.body[0].key).toBe(apiKey2); // The second key should replace the first

			// Verify the first API key no longer works
			let apiResponse = await getRoomsWithApiKey(apiKey1);
			expect(apiResponse.status).toBe(401);

			// Verify the second API key works
			apiResponse = await getRoomsWithApiKey(apiKey2);
			expect(apiResponse.status).toBe(200);
		});
	});
});
