import { beforeAll, describe, expect, it } from '@jest/globals';
import { startTestServer } from '../../../helpers/request-helpers.js';
import { getAppearancePreferences, updateAppearancePreferences } from '../../../helpers/request-helpers.js';

describe('Appearance API Tests', () => {
	beforeAll(() => {
		startTestServer();
	});

	describe('Get Appearance Preferences', () => {
		it('should return 402 status code as it is a PRO feature', async () => {
			const response = await getAppearancePreferences();
			expect(response.status).toBe(402);
		});
	});
	describe('Update Appearance Preferences', () => {
		it('should return 402 status code as it is a PRO feature', async () => {
			const response = await updateAppearancePreferences({});
			expect(response.status).toBe(402);
		});
	});
});
