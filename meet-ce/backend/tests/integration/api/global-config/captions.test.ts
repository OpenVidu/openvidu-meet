import { beforeAll, describe, expect, it } from '@jest/globals';
import { getCaptionsConfig, startTestServer } from '../../../helpers/request-helpers.js';

describe('Captions Config API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	describe('Get captions config', () => {
		it('should return captions config when not authenticated', async () => {
			const response = await getCaptionsConfig();
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('enabled');
			expect(typeof response.body.enabled).toBe('boolean');
		});

		it('should return enabled true by default', async () => {
			const response = await getCaptionsConfig();
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ enabled: false });
		});
	});
});
