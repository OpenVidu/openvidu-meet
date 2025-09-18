import { beforeAll, describe, expect, it } from '@jest/globals';
import { getAppearanceConfig, startTestServer, updateAppearanceConfig } from '../../../helpers/request-helpers.js';

describe('Appearance API Tests', () => {
	beforeAll(() => {
		startTestServer();
	});

	describe('Get Appearance Config', () => {
		it('should return 402 status code as it is a PRO feature', async () => {
			const response = await getAppearanceConfig();
			expect(response.status).toBe(402);
		});
	});

	describe('Update Appearance Config', () => {
		it('should return 402 status code as it is a PRO feature', async () => {
			const response = await updateAppearanceConfig({});
			expect(response.status).toBe(402);
		});
	});
});
