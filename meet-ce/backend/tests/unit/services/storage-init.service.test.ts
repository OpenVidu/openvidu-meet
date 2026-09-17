import { describe, expect, it, jest } from '@jest/globals';
import ms from 'ms';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { StorageInitService } from '../../../src/services/storage/storage-init.service.js';

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

const buildService = (mutex: FakeMutexService) => {
	const initializers = [
		jest.fn(async () => {}),
		jest.fn(async () => {}),
		jest.fn(async () => {}),
		jest.fn(async () => {})
	];
	const [initializeGlobalConfig, initializeAdminUser, initializeApiKey, initializeDefaultWebhook] = initializers;
	const service = new StorageInitService(
		...([
			noopLogger,
			mutex,
			{ initializeGlobalConfig },
			{ initializeAdminUser },
			{ initializeApiKey },
			{ initializeDefaultWebhook }
		] as unknown as ConstructorParameters<typeof StorageInitService>)
	);
	return { service, initializers };
};

describe('StorageInitService.initializeStorage (boot lock contract)', () => {
	it('runs every initializer once the lock is acquired, using the boot retry budget', async () => {
		const mutex = new FakeMutexService('acquired');
		const { service, initializers } = buildService(mutex);

		await service.initializeStorage();

		for (const initializer of initializers) {
			expect(initializer).toHaveBeenCalledTimes(1);
		}

		expect(mutex.calls).toEqual([
			{
				key: expect.stringContaining('storage_initialization'),
				ttl: ms(INTERNAL_CONFIG.STORAGE_INIT_LOCK_TTL),
				maxAttempts: INTERNAL_CONFIG.STORAGE_INIT_LOCK_MAX_ATTEMPTS,
				delayMs: ms(INTERNAL_CONFIG.STORAGE_INIT_LOCK_RETRY_DELAY)
			}
		]);
	});

	it('runs every initializer again on a later start, leaving each one to skip what already exists', async () => {
		const { service, initializers } = buildService(new FakeMutexService('acquired'));

		await service.initializeStorage();
		await service.initializeStorage();

		for (const initializer of initializers) {
			expect(initializer).toHaveBeenCalledTimes(2);
		}
	});

	it('fails startup instead of skipping when the lock is never acquired within the budget', async () => {
		const { service, initializers } = buildService(new FakeMutexService('exhausted'));

		await expect(service.initializeStorage()).rejects.toThrow(
			'Unexpected error while Failed to initialize storage'
		);

		for (const initializer of initializers) {
			expect(initializer).not.toHaveBeenCalled();
		}
	});
});
