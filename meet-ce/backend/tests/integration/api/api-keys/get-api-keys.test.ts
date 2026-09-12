import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
	generateApiKey,
	getApiKeys,
	restoreDefaultApiKeys,
	startTestServer
} from '../../../helpers/request-helpers.js';

describe('API Keys API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await restoreDefaultApiKeys();
	});

	describe('Get API Keys', () => {
		it('should get the list of API keys', async () => {
			const key = await generateApiKey();
			const response = await getApiKeys();

			expect(response.status).toBe(200);
			// The deployment holds one API key at a time, so the listing is the key just created
			expect(response.body).toEqual([{ key, creationDate: expect.any(Number) }]);
		});
	});
});
