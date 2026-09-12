import { describe, expect, it } from '@jest/globals';
import { getSystemInfo } from '../../src/utils/system-info.utils.js';
import { MEET_ENV } from '../../src/environment.js';
import { INTERNAL_CONFIG } from '../../src/config/internal-config.js';

describe('system-info.utils - GET /info payload', () => {
	it('should expose all required fields', () => {
		const info = getSystemInfo();

		expect(info).toEqual({
			service: MEET_ENV.NAME_ID,
			version: expect.any(String),
			gitCommit: expect.any(String),
			buildDate: expect.any(String),
			edition: MEET_ENV.EDITION.toLowerCase(),
			apiVersion: expect.any(String)
		});
	});

	it('should report the edition lowercased, whatever the environment spells', () => {
		const info = getSystemInfo();

		expect(info.edition).not.toMatch(/[A-Z]/);
		expect(info.edition).toBe(MEET_ENV.EDITION.toLowerCase());
	});

	it('should derive apiVersion from the public API base path', () => {
		const info = getSystemInfo();
		const expectedApiVersion = INTERNAL_CONFIG.API_BASE_PATH_V1.split('/').pop();

		expect(info.apiVersion).toBe(expectedApiVersion);
	});
});
