import { beforeAll, describe, expect, it } from '@jest/globals';
import { getMeetingLayoutConfig, startTestServer } from '../../../helpers/request-helpers.js';

describe('Meeting Layout Config API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	describe('Get meeting layout config', () => {
		it('should return meeting layout config when not authenticated', async () => {
			const response = await getMeetingLayoutConfig();
			expect(response.status).toBe(200);
			expect(typeof response.body.forceMosaicLayout).toBe('boolean');
			expect(['cover', 'contain']).toContain(response.body.videoObjectFit);
		});

		it('should return the default layout when no env var is set', async () => {
			const response = await getMeetingLayoutConfig();
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ forceMosaicLayout: false, videoObjectFit: 'cover' });
		});
	});
});
