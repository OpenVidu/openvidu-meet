import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import {
	startTestServer,
	updateWebbhookPreferences,
	getWebbhookPreferences
} from '../../../helpers/request-helpers.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { MEET_WEBHOOK_ENABLED, MEET_WEBHOOK_URL } from '../../../../src/environment.js';

const restoreDefaultWebhookPreferences = async () => {
	const defaultPreferences = {
		enabled: MEET_WEBHOOK_ENABLED === 'true',
		url: MEET_WEBHOOK_URL
	};
	await updateWebbhookPreferences(defaultPreferences);
};

describe('Webhook Preferences API Tests', () => {
	beforeAll(() => {
		startTestServer();
	});

	afterEach(async () => {
		await restoreDefaultWebhookPreferences();
	});

	describe('Update webhook preferences', () => {
		it('should update webhook preferences with valid data', async () => {
			const validPreferences = {
				enabled: true,
				url: 'https://example.com/webhook'
			};
			let response = await updateWebbhookPreferences(validPreferences);

			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Webhooks preferences updated successfully');

			response = await getWebbhookPreferences();
			expect(response.status).toBe(200);
			expect(response.body.enabled).toBe(true);
			expect(response.body.url).toBe(validPreferences.url);
			expect(response.body).toEqual(validPreferences);
		});

		it('should allow disabling webhooks', async () => {
			const oldWebhookPreferences = await getWebbhookPreferences();
			expect(oldWebhookPreferences.status).toBe(200);

			let response = await updateWebbhookPreferences({
				enabled: false
			});

			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Webhooks preferences updated successfully');

			response = await getWebbhookPreferences();
			expect(response.status).toBe(200);
			expect(response.body.enabled).toBe(false);
			expect(response.body.url).toBe(oldWebhookPreferences.body.url);
		});

		it('should update URL even when disabling webhooks', async () => {
			const preference = {
				enabled: false,
				url: 'https://newurl.com/webhook'
			};
			const response = await updateWebbhookPreferences(preference);

			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Webhooks preferences updated successfully');

			const preferencesResponse = await getWebbhookPreferences();
			expect(preferencesResponse.status).toBe(200);
			expect(preferencesResponse.body.enabled).toBe(preference.enabled);
			expect(preferencesResponse.body.url).toBe(preference.url);
		});
	});

	describe('Update webhook preferences validation', () => {
		it('should reject invalid webhook URL', async () => {
			const response = await updateWebbhookPreferences({
				enabled: true,
				url: 'invalid-url'
			});

			expect(response.status).toBe(422);
			expectValidationError(response, 'url', 'URL must start with http:// or https://');
		});

		it('should reject missing URL when webhooks are enabled', async () => {
			const response = await updateWebbhookPreferences({ enabled: true });

			expect(response.status).toBe(422);
			expectValidationError(response, 'url', 'URL is required when webhooks are enabled');
		});

		it('should reject non-http(s) URLs', async () => {
			const response = await updateWebbhookPreferences({
				enabled: true,
				url: 'ftp://example.com/webhook'
			});

			expect(response.status).toBe(422);
			expectValidationError(response, 'url', 'URL must start with http:// or https://');
		});
	});

	describe('Get webhook preferences', () => {
		it('should return webhook preferences when authenticated as admin', async () => {
			const response = await getWebbhookPreferences();

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				enabled: MEET_WEBHOOK_ENABLED === 'true',
				url: MEET_WEBHOOK_URL
			});
		});
	});
});
