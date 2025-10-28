import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { Request } from 'express';
import { MEET_INITIAL_WEBHOOK_ENABLED, MEET_INITIAL_WEBHOOK_URL } from '../../../../src/environment.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	getWebbhookConfig,
	restoreDefaultGlobalConfig,
	startTestServer,
	testWebhookUrl,
	updateWebbhookConfig
} from '../../../helpers/request-helpers.js';
import { startWebhookServer, stopWebhookServer } from '../../../helpers/test-scenarios.js';

describe('Webhook Config API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterEach(async () => {
		await restoreDefaultGlobalConfig();
	});

	describe('Update webhook config', () => {
		it('should update webhook config with valid data', async () => {
			const validConfig = {
				enabled: true,
				url: 'https://example.com/webhook'
			};
			let response = await updateWebbhookConfig(validConfig);

			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Webhooks config updated successfully');

			response = await getWebbhookConfig();
			expect(response.status).toBe(200);
			expect(response.body.enabled).toBe(true);
			expect(response.body.url).toBe(validConfig.url);
			expect(response.body).toEqual(validConfig);
		});

		it('should allow disabling webhooks', async () => {
			const oldWebhookConfig = await getWebbhookConfig();
			expect(oldWebhookConfig.status).toBe(200);

			let response = await updateWebbhookConfig({
				enabled: false
			});

			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Webhooks config updated successfully');

			response = await getWebbhookConfig();
			expect(response.status).toBe(200);
			expect(response.body.enabled).toBe(false);
			expect(response.body.url).toBe(oldWebhookConfig.body.url);
		});

		it('should update URL even when disabling webhooks', async () => {
			const config = {
				enabled: false,
				url: 'https://newurl.com/webhook'
			};
			const response = await updateWebbhookConfig(config);

			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Webhooks config updated successfully');

			const configResponse = await getWebbhookConfig();
			expect(configResponse.status).toBe(200);
			expect(configResponse.body.enabled).toBe(config.enabled);
			expect(configResponse.body.url).toBe(config.url);
		});
	});

	describe('Update webhook config validation', () => {
		it('should reject invalid webhook URL', async () => {
			const response = await updateWebbhookConfig({
				enabled: true,
				url: 'invalid-url'
			});

			expect(response.status).toBe(422);
			expectValidationError(response, 'url', 'URL must start with http:// or https://');
		});

		it('should reject missing URL when webhooks are enabled', async () => {
			const response = await updateWebbhookConfig({ enabled: true });

			expect(response.status).toBe(422);
			expectValidationError(response, 'url', 'URL is required when webhooks are enabled');
		});

		it('should reject non-http(s) URLs', async () => {
			const response = await updateWebbhookConfig({
				enabled: true,
				url: 'ftp://example.com/webhook'
			});

			expect(response.status).toBe(422);
			expectValidationError(response, 'url', 'URL must start with http:// or https://');
		});
	});

	describe('Get webhook config', () => {
		it('should return webhook config when authenticated as admin', async () => {
			const response = await getWebbhookConfig();

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
