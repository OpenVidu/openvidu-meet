import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { Request } from 'express';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MEET_INITIAL_WEBHOOK_ENABLED, MEET_INITIAL_WEBHOOK_URL } from '../../../../src/environment.js';
import { MeetStorageService } from '../../../../src/services/index.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	getWebbhookPreferences,
	startTestServer,
	testWebhookUrl,
	updateWebbhookPreferences
} from '../../../helpers/request-helpers.js';
import { startWebhookServer, stopWebhookServer } from '../../../helpers/test-scenarios.js';

describe('Webhook Preferences API Tests', () => {
	beforeAll(() => {
		startTestServer();
	});

	afterEach(async () => {
		const storageService = container.get(MeetStorageService);
		await storageService['initializeGlobalPreferences']();
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
				enabled: MEET_INITIAL_WEBHOOK_ENABLED === 'true',
				url: MEET_INITIAL_WEBHOOK_URL
			});
		});
	});

	describe('Test webhook URL', () => {
		beforeAll(async () => {
			// Start a webhook server to test against
			await startWebhookServer(5080, (req: Request) => {
				console.log('Webhook received:', req.body);
			});
		});

		afterAll(async () => {
			await stopWebhookServer();
		});

		it('should return 200 if the webhook URL is reachable', async () => {
			const response = await testWebhookUrl('http://localhost:5080/webhook');
			expect(response.status).toBe(200);
		});

		it('should return 400 if the webhook URL is not reachable', async () => {
			const response = await testWebhookUrl('http://localhost:5999/doesnotexist');
			expect(response.status).toBe(400);
			expect(response.body.error).toBeDefined();
		});

		it('should return 422 if the webhook URL is invalid', async () => {
			const response = await testWebhookUrl('not-a-valid-url');
			expectValidationError(response, 'url', 'URL must start with http:// or https://');
		});
	});
});
