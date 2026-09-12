import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { MeetWebhook } from '@openvidu-meet/typings';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { container } from '../../../src/config/dependency-injector.config.js';
import { MEET_ENV } from '../../../src/environment.js';
import { MeetLock } from '../../../src/helpers/redis.helper.js';
import type { MeetMigration } from '../../../src/models/migration.model.js';
import { LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME, MigrationStatus } from '../../../src/models/migration.model.js';
import { MeetGlobalConfigModel } from '../../../src/models/mongoose-schemas/global-config.schema.js';
import { MeetMigrationModel } from '../../../src/models/mongoose-schemas/migration.schema.js';
import { WebhookRepository } from '../../../src/repositories/webhook.repository.js';
import { MigrationService } from '../../../src/services/migration.service.js';
import { MutexService } from '../../../src/services/mutex.service.js';
import { WebhookRegistryService } from '../../../src/services/webhook-registry.service.js';
import { createWebhook, deleteAllWebhooks, getWebhooks, startTestServer } from '../../helpers/request-helpers.js';

/**
 * Startup lifecycle of the webhook collection: the one-shot migration of the legacy global-config
 * webhook URL into the collection (run as part of `MigrationService.runMigrations()`, same as every
 * other migration test in this suite), and the seeding of the initial entry from the environment on
 * a fresh deployment.
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

const getMigrationRecord = async (): Promise<MeetMigration | null> =>
	(await MeetMigrationModel.findOne({ name: LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME })
		.lean()
		.exec()) as MeetMigration | null;

const removeMigrationRecord = async () => {
	await MeetMigrationModel.deleteOne({ name: LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME }).exec();
};

// MeetGlobalConfig is meant to hold exactly one document (WebhookMigration reads it via an
// unscoped findOne({}), same as the rest of this file's helpers), so simulating "no document yet"
// must delete and restore the real singleton in place rather than touching the collection at large.
const getRawGlobalConfigDocument = () => MeetGlobalConfigModel.collection.findOne({});

describe('Webhook Config Migration Integration Tests', () => {
	let webhookRegistryService: WebhookRegistryService;
	let migrationService: MigrationService;

	beforeAll(async () => {
		await startTestServer();
		webhookRegistryService = container.get(WebhookRegistryService);
		migrationService = container.get(MigrationService);
	});

	afterEach(async () => {
		await deleteAllWebhooks();
		await removeLegacyWebhookConfig();
		await removeMigrationRecord();
	});

	afterAll(async () => {
		await deleteAllWebhooks();
		await removeLegacyWebhookConfig();
		await removeMigrationRecord();
	});

	describe('Legacy webhook config migration', () => {
		it('should move the configured URL into the collection and clear it', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true, url: 'https://legacy.example.com/hook' });

			await migrationService.runMigrations();

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

			await migrationService.runMigrations();

			const webhooks = await listWebhooks();
			expect(webhooks.length).toBe(1);
			expect(webhooks[0].enabled).toBe(false);
		});

		it('should never resurrect a webhook the operator deleted', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true, url: 'https://legacy.example.com/hook' });

			await migrationService.runMigrations();
			await deleteAllWebhooks();

			// The next boot runs the migration again; the URL was cleared, so nothing comes back
			await migrationService.runMigrations();

			expect(await listWebhooks()).toEqual([]);
		});

		it('should only clear the URL when webhooks already exist (interrupted previous run)', async () => {
			await deleteAllWebhooks();
			await createWebhook({ url: 'https://existing.example.com/hook' });
			await setLegacyWebhookConfig({ enabled: true, url: 'https://legacy.example.com/hook' });

			await migrationService.runMigrations();

			const webhooks = await listWebhooks();
			expect(webhooks.length).toBe(1);
			expect(webhooks[0].url).toBe('https://existing.example.com/hook');

			const legacyConfig = await getRawWebhooksConfig();
			expect(legacyConfig?.url).toBeUndefined();
		});

		it('should be a no-op without a legacy URL', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true });

			await migrationService.runMigrations();

			expect(await listWebhooks()).toEqual([]);
		});
	});

	/**
	 * States a real v3.7.0 deployment (GLOBAL_CONFIG_SCHEMA_VERSION 1, `webhooksConfig` required with
	 * `enabled` required and `url` optional) could actually be in, plus the always-exercised fresh
	 * install path: migrations run before `StorageInitService` creates the first config document.
	 */
	describe('Legacy config edge cases', () => {
		it('should be a no-op on a fresh install with no global config document yet', async () => {
			await deleteAllWebhooks();
			const existingConfig = await getRawGlobalConfigDocument();
			expect(existingConfig).toBeTruthy();
			await MeetGlobalConfigModel.collection.deleteOne({ _id: existingConfig!._id });

			try {
				await migrationService.runMigrations();
				expect(await listWebhooks()).toEqual([]);
			} finally {
				await MeetGlobalConfigModel.collection.insertOne(existingConfig!);
			}
		});

		it('should be a no-op when the legacy URL is an empty string', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true, url: '' });

			await migrationService.runMigrations();

			expect(await listWebhooks()).toEqual([]);
		});

		it('should be a no-op when disabled with no URL configured', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: false });

			await migrationService.runMigrations();

			expect(await listWebhooks()).toEqual([]);
		});

		it('should clear a syntactically invalid URL without copying it', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true, url: 'not-a-valid-url' });

			await migrationService.runMigrations();

			// This startup step calls WebhookRegistryService.createWebhook directly, bypassing the
			// request-validator middleware, so it re-checks the URL against the same
			// MeetWebhookOptionsSchema POST /webhooks uses before trusting legacy data
			expect(await listWebhooks()).toEqual([]);

			const legacyConfig = await getRawWebhooksConfig();
			expect(legacyConfig?.url).toBeUndefined();

			const migration = await getMigrationRecord();
			expect(migration!.metadata).toEqual(expect.objectContaining({ copied: false, invalidUrl: true }));
		});

		it('should clear the URL without copying when multiple webhooks already exist', async () => {
			await deleteAllWebhooks();
			await createWebhook({ url: 'https://existing-1.example.com/hook' });
			await createWebhook({ url: 'https://existing-2.example.com/hook' });
			await setLegacyWebhookConfig({ enabled: true, url: 'https://legacy.example.com/hook' });

			await migrationService.runMigrations();

			const webhooks = await listWebhooks();
			expect(webhooks.length).toBe(2);
			expect(webhooks.map((webhook) => webhook.url)).not.toContain('https://legacy.example.com/hook');

			const legacyConfig = await getRawWebhooksConfig();
			expect(legacyConfig?.url).toBeUndefined();

			const migration = await getMigrationRecord();
			expect(migration!.metadata).toEqual(expect.objectContaining({ copied: false, existingWebhooks: 2 }));
		});

		it('should re-run and refresh the tracking record when it is completed but the legacy URL is still present', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true, url: 'https://legacy.example.com/hook' });
			// Simulates a desynced record — e.g. a manual DB fix that marked it completed without
			// actually clearing the field. The gate must stay the data, not this record.
			const staleStartedAt = Date.now() - 60_000;
			await MeetMigrationModel.create({
				name: LEGACY_WEBHOOK_CONFIG_MIGRATION_NAME,
				status: MigrationStatus.COMPLETED,
				startedAt: staleStartedAt,
				completedAt: staleStartedAt + 100
			});

			await migrationService.runMigrations();

			const webhooks = await listWebhooks();
			expect(webhooks.length).toBe(1);
			expect(webhooks[0].url).toBe('https://legacy.example.com/hook');

			const migration = await getMigrationRecord();
			expect(migration!.startedAt).toBeGreaterThan(staleStartedAt);
		});

		it('should migrate a genuine v3.7.0 document (legacy auth fields and webhook URL) in one pass', async () => {
			await deleteAllWebhooks();
			await MeetGlobalConfigModel.collection.updateOne(
				{},
				{
					$set: {
						schemaVersion: 1,
						'securityConfig.authentication.authMethod': { type: 'single_user' },
						'securityConfig.authentication.authModeToAccessRoom': 'none',
						webhooksConfig: { enabled: true, url: 'https://v370.example.com/hook' }
					},
					$unset: { 'securityConfig.authentication.oauthProviders': '' }
				}
			);

			await migrationService.runMigrations();

			const webhooks = await listWebhooks();
			expect(webhooks.length).toBe(1);
			expect(webhooks[0].url).toBe('https://v370.example.com/hook');

			const migratedConfig = (await getRawGlobalConfigDocument()) as Record<string, unknown>;
			expect(migratedConfig.schemaVersion).toBe(INTERNAL_CONFIG.GLOBAL_CONFIG_SCHEMA_VERSION);
			expect(migratedConfig).not.toHaveProperty('webhooksConfig');

			const authentication = (migratedConfig.securityConfig as Record<string, unknown>).authentication as Record<
				string,
				unknown
			>;
			expect(authentication).not.toHaveProperty('authMethod');
			expect(authentication).not.toHaveProperty('authModeToAccessRoom');
			expect(authentication.oauthProviders).toEqual([]);
		});
	});

	/**
	 * The run is recorded in the same collection as the schema migrations, so a single query answers
	 * "which migrations has this deployment run". As there, the record is an audit trail and not the
	 * gate: a deployment with nothing to migrate must not be left with a record claiming otherwise.
	 */
	describe('Legacy webhook config migration tracking', () => {
		it('should record a completed migration describing the copy', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true, url: 'https://legacy.example.com/hook' });

			await migrationService.runMigrations();

			const [webhook] = await listWebhooks();
			const migration = await getMigrationRecord();
			expect(migration).not.toBeNull();
			expect(migration!.status).toBe(MigrationStatus.COMPLETED);
			expect(migration!.completedAt).toEqual(expect.any(Number));
			expect(migration!.metadata).toEqual(
				expect.objectContaining({
					url: 'https://legacy.example.com/hook',
					enabled: true,
					copied: true,
					webhookId: webhook.webhookId,
					existingWebhooks: 0
				})
			);
		});

		it('should record the run that only cleared the URL as not copied', async () => {
			await deleteAllWebhooks();
			await createWebhook({ url: 'https://existing.example.com/hook' });
			await setLegacyWebhookConfig({ enabled: true, url: 'https://legacy.example.com/hook' });

			await migrationService.runMigrations();

			const migration = await getMigrationRecord();
			expect(migration!.status).toBe(MigrationStatus.COMPLETED);
			expect(migration!.metadata).toEqual(expect.objectContaining({ copied: false, existingWebhooks: 1 }));
		});

		it('should not record anything on a deployment without a legacy URL', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true });

			await migrationService.runMigrations();

			expect(await getMigrationRecord()).toBeNull();
		});

		it('should not record a second run once the URL is cleared', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true, url: 'https://legacy.example.com/hook' });

			await migrationService.runMigrations();
			const firstRun = await getMigrationRecord();

			// The next boot finds no URL left, so the recorded run stays as it was
			await migrationService.runMigrations();

			const secondRun = await getMigrationRecord();
			expect(secondRun!.startedAt).toBe(firstRun!.startedAt);
			expect(secondRun!.completedAt).toBe(firstRun!.completedAt);
		});
	});

	/**
	 * HA deployments run this migration from every replica at once. The exclusion these tests rely
	 * on is the real Redis lock (`MeetLock.getMigrationLock()`), not JS call ordering, so racing the
	 * same singleton `MigrationService` concurrently exercises the same guarantee multiple replica
	 * processes would depend on.
	 */
	describe('HA concurrency and lock safety', () => {
		it('should create exactly one webhook when multiple replicas race to migrate concurrently', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true, url: 'https://race.example.com/hook' });

			await Promise.all(Array.from({ length: 5 }, () => migrationService.runMigrations()));

			const webhooks = await listWebhooks();
			expect(webhooks.length).toBe(1);
			expect(webhooks[0].url).toBe('https://race.example.com/hook');

			const mutexService = container.get(MutexService);
			expect(await mutexService.lockExists(MeetLock.getMigrationLock())).toBe(false);
		});

		it('should release the migration lock and mark the migration failed when webhook creation throws', async () => {
			await deleteAllWebhooks();
			await setLegacyWebhookConfig({ enabled: true, url: 'https://fails.example.com/hook' });

			const webhookRepository = container.get(WebhookRepository);
			const createSpy = jest.spyOn(webhookRepository, 'create').mockRejectedValueOnce(new Error('boom'));

			await expect(migrationService.runMigrations()).rejects.toThrow('boom');
			createSpy.mockRestore();

			const failedMigration = await getMigrationRecord();
			expect(failedMigration!.status).toBe(MigrationStatus.FAILED);
			expect(failedMigration!.error).toBe('boom');

			const mutexService = container.get(MutexService);
			expect(await mutexService.lockExists(MeetLock.getMigrationLock())).toBe(false);

			// The failed attempt must not have cleared the legacy URL, and the lock must not be stuck:
			// a following, unobstructed run has to recover on its own
			await migrationService.runMigrations();

			const webhooks = await listWebhooks();
			expect(webhooks.length).toBe(1);
			expect(webhooks[0].url).toBe('https://fails.example.com/hook');

			const recoveredMigration = await getMigrationRecord();
			expect(recoveredMigration!.status).toBe(MigrationStatus.COMPLETED);
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
