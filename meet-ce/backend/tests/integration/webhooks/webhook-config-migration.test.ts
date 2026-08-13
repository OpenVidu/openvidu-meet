import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import type { MeetWebhook } from '@openvidu-meet/typings';
import { container } from '../../../src/config/dependency-injector.config.js';
import { MEET_ENV } from '../../../src/environment.js';
import { MeetGlobalConfigModel } from '../../../src/models/mongoose-schemas/global-config.schema.js';
import { WebhookRegistryService } from '../../../src/services/webhook-registry.service.js';
import { createWebhook, deleteAllWebhooks, getWebhooks, startTestServer } from '../../helpers/request-helpers.js';

/**
 * Startup lifecycle of the webhook collection: the one-shot migration of the legacy global-config
 * webhook URL into the collection, and the seeding of the initial entry from the environment on a
 * fresh deployment. Both are invoked directly on the service — the same call the server startup
 * makes.
 */

const setLegacyWebhookConfig = async (config: { enabled: boolean; url?: string }) => {
	await MeetGlobalConfigModel.collection.updateOne({}, { $set: { webhooksConfig: config } });
};

// The current schema no longer declares the field, so tests must not leave it behind
const removeLegacyWebhookConfig = async () => {
	await MeetGlobalConfigModel.collection.updateOne({}, { $unset: { webhooksConfig: '' } });
};

const getRawWebhooksConfig = async (): Promise<{ enabled?: boolean; url?: string } | undefined> => {
	const rawConfig = await MeetGlobalConfigModel.collection.findOne<{
		webhooksConfig?: { enabled?: boolean; url?: string };
	}>({});
	return rawConfig?.webhooksConfig;
};

const listWebhooks = async (): Promise<MeetWebhook[]> => {
	const response = await getWebhooks();
	return (response.body as { webhooks: MeetWebhook[] }).webhooks;
};

describe('Webhook Config Migration Integration Tests', () => {
	let webhookRegistryService: WebhookRegistryService;

	beforeAll(async () => {
		await startTestServer();
		webhookRegistryService = container.get(WebhookRegistryService);
	});

	afterEach(async () => {
		await deleteAllWebhooks();
		await removeLegacyWebhookConfig();
	});

	afterAll(async () => {
		await deleteAllWebhooks();
		await removeLegacyWebhookConfig();
	});

	describe('Legacy webhook config migration', () => {
		it('should move the configured URL into the collection and clear it', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true, url: 'https://legacy.example.com/hook' });

			await webhookRegistryService.migrateLegacyWebhookConfig();

			const webhooks = await listWebhooks();
			expect(webhooks.length).toBe(1);
			expect(webhooks[0].url).toBe('https://legacy.example.com/hook');
			expect(webhooks[0].enabled).toBe(true);

			const legacyConfig = await getRawWebhooksConfig();
			expect(legacyConfig?.url).toBeUndefined();
		});

		it('should preserve the disabled state of the legacy config', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: false, url: 'https://disabled.example.com/hook' });

			await webhookRegistryService.migrateLegacyWebhookConfig();

			const webhooks = await listWebhooks();
			expect(webhooks.length).toBe(1);
			expect(webhooks[0].enabled).toBe(false);
		});

		it('should never resurrect a webhook the operator deleted', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true, url: 'https://legacy.example.com/hook' });

			await webhookRegistryService.migrateLegacyWebhookConfig();
			await deleteAllWebhooks();

			// The next boot runs the migration again; the URL was cleared, so nothing comes back
			await webhookRegistryService.migrateLegacyWebhookConfig();

			expect(await listWebhooks()).toEqual([]);
		});

		it('should only clear the URL when webhooks already exist (interrupted previous run)', async () => {
			await deleteAllWebhooks();
			await createWebhook({ url: 'https://existing.example.com/hook' });
			await setLegacyWebhookConfig({ enabled: true, url: 'https://legacy.example.com/hook' });

			await webhookRegistryService.migrateLegacyWebhookConfig();

			const webhooks = await listWebhooks();
			expect(webhooks.length).toBe(1);
			expect(webhooks[0].url).toBe('https://existing.example.com/hook');

			const legacyConfig = await getRawWebhooksConfig();
			expect(legacyConfig?.url).toBeUndefined();
		});

		it('should be a no-op without a legacy URL', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true });

			await webhookRegistryService.migrateLegacyWebhookConfig();

			expect(await listWebhooks()).toEqual([]);
		});
	});

	describe('Initial webhook seeding', () => {
		const originalUrl = MEET_ENV.INITIAL_WEBHOOK_URL;
		const originalEnabled = MEET_ENV.INITIAL_WEBHOOK_ENABLED;

		afterEach(() => {
			MEET_ENV.INITIAL_WEBHOOK_URL = originalUrl;
			MEET_ENV.INITIAL_WEBHOOK_ENABLED = originalEnabled;
		});

		it('should register the webhook configured through the environment', async () => {
			await deleteAllWebhooks();
			MEET_ENV.INITIAL_WEBHOOK_URL = 'https://initial.example.com/hook';
			MEET_ENV.INITIAL_WEBHOOK_ENABLED = 'true';

			await webhookRegistryService.initializeDefaultWebhook();

			const webhooks = await listWebhooks();
			expect(webhooks.length).toBe(1);
			expect(webhooks[0].url).toBe('https://initial.example.com/hook');
			// The test environment configures an initial API key, so the entry starts enabled
			expect(webhooks[0].enabled).toBe(true);
		});

		it('should be a no-op without an initial webhook URL', async () => {
			await deleteAllWebhooks();
			MEET_ENV.INITIAL_WEBHOOK_URL = '';

			await webhookRegistryService.initializeDefaultWebhook();

			expect(await listWebhooks()).toEqual([]);
		});
	});
});
