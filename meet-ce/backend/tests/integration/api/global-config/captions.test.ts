import { beforeAll, describe, expect, it } from '@jest/globals';
import { getCaptionsConfig, startTestServer } from '../../../helpers/request-helpers.js';

describe('Captions Config API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	describe('Get captions config', () => {
		it('should serve the captions config unauthenticated, disabled unless MEET_CAPTIONS_ENABLED says otherwise', async () => {
			const response = await getCaptionsConfig();
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ enabled: false });
		});
	});
});
