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
			await generateApiKey();
			const response = await getApiKeys();

			expect(Array.isArray(response.body)).toBe(true);

			if (response.body.length > 0) {
				expect(response.body[0]).toHaveProperty('key');
				expect(response.body[0]).toHaveProperty('creationDate');
			}
		});
	});
});
