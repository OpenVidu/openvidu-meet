import { describe, expect, it } from '@jest/globals';
import ms from 'ms';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { MigrationService } from '../../../src/services/migration.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

/**
 * MutexService stand-in for the boot-lock contract: 'acquired' models winning the lock on some
 * attempt within the retry budget, 'exhausted' models the budget running out. Records the budget
 * the caller asked for.
 */
class FakeMutexService {
	calls: Array<{ key: string; ttl: number; maxAttempts: number; delayMs: number }> = [];

	constructor(private outcome: 'acquired' | 'exhausted') {}

	async withRetryLock<T>(
		key: string,
		ttl: number,
		callback: () => Promise<T>,
		maxAttempts: number,
		delayMs: number
	): Promise<T | null> {
		this.calls.push({ key, ttl, maxAttempts, delayMs });

		if (this.outcome === 'exhausted') {
			return null;
		}

		return callback();
	}
}

class FakeWebhookMigration {
	runs = 0;
	failure: Error | null = null;

	async run(): Promise<void> {
		if (this.failure) {
			throw this.failure;
		}

		this.runs++;
	}
}

/** The real steps hit Mongoose models; the lock contract under test doesn't need them. */
class StubbedMigrationService extends MigrationService {
	schemaRuns = 0;
	indexRuns = 0;

	protected async runSchemaMigrations(): Promise<void> {
		this.schemaRuns++;
	}

	protected async runIndexMigrations(): Promise<void> {
		this.indexRuns++;
	}
}

const buildService = (mutex: FakeMutexService, webhookMigration = new FakeWebhookMigration()) =>
	new StubbedMigrationService(
		...([noopLogger, mutex, {}, webhookMigration] as unknown as ConstructorParameters<typeof MigrationService>)
	);

describe('MigrationService.runMigrations (boot lock contract)', () => {
	it('runs every migration step itself once the lock is acquired, using the boot retry budget', async () => {
		const mutex = new FakeMutexService('acquired');
		const webhookMigration = new FakeWebhookMigration();
		const service = buildService(mutex, webhookMigration);

		await service.runMigrations();

		expect(webhookMigration.runs).toBe(1);
		expect(service.schemaRuns).toBe(1);
		expect(service.indexRuns).toBe(1);
		expect(mutex.calls).toEqual([
			{
				key: expect.stringContaining('migration'),
				ttl: ms(INTERNAL_CONFIG.MIGRATION_LOCK_TTL),
				maxAttempts: INTERNAL_CONFIG.MIGRATION_LOCK_MAX_ATTEMPTS,
				delayMs: ms(INTERNAL_CONFIG.MIGRATION_LOCK_RETRY_DELAY)
			}
		]);
	});

	it('aborts startup instead of skipping when the lock is never acquired within the budget', async () => {
		const webhookMigration = new FakeWebhookMigration();
		const service = buildService(new FakeMutexService('exhausted'), webhookMigration);

		await expect(service.runMigrations()).rejects.toThrow(/Could not acquire migration lock/);
		expect(webhookMigration.runs).toBe(0);
		expect(service.schemaRuns).toBe(0);
	});

	it('propagates a failing migration instead of swallowing it', async () => {
		const webhookMigration = new FakeWebhookMigration();
		webhookMigration.failure = new Error('legacy copy failed');
		const service = buildService(new FakeMutexService('acquired'), webhookMigration);

		await expect(service.runMigrations()).rejects.toThrow('legacy copy failed');
		expect(service.schemaRuns).toBe(0);
	});
});
