import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import {
	deleteApiKeys,
	generateApiKey,
	getApiKeys,
	getFullPath,
	restoreDefaultApiKeys,
	startTestServer
} from '../../../helpers/request-helpers.js';

describe('API Keys API Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
	});

	afterAll(async () => {
		await restoreDefaultApiKeys();
	});

	const getRoomsWithApiKey = async (apiKey: string) => {
		return request(app)
			.get(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`))
			.set(INTERNAL_CONFIG.API_KEY_HEADER, apiKey);
	};

	describe('Delete API Keys', () => {
		it('should delete all API keys', async () => {
			const apiKey = await generateApiKey();
			await deleteApiKeys();

			// Confirm deletion
			const getResponse = await getApiKeys();
			expect(getResponse.status).toBe(200);
			expect(Array.isArray(getResponse.body)).toBe(true);
			expect(getResponse.body.length).toBe(0);

			// Verify the deleted API key no longer works
			const apiResponse = await getRoomsWithApiKey(apiKey);
			expect(apiResponse.status).toBe(401);
		});
	});
});
