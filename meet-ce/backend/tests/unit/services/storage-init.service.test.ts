import { describe, expect, it, jest } from '@jest/globals';
import ms from 'ms';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../src/environment.js';
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

const buildService = (mutex: FakeMutexService, existingProjectId: string | null) => {
	const initializers = {
		globalConfigService: { initializeGlobalConfig: jest.fn(async () => {}) },
		userService: { initializeAdminUser: jest.fn(async () => {}) },
		apiKeyService: { initializeApiKey: jest.fn(async () => {}) },
		webhookRegistryService: { initializeDefaultWebhook: jest.fn(async () => {}) }
	};
	const globalConfigRepository = {
		get: async () => (existingProjectId === null ? null : { projectId: existingProjectId })
	};
	const service = new StorageInitService(
		...([
			noopLogger,
			mutex,
			initializers.globalConfigService,
			globalConfigRepository,
			initializers.userService,
			initializers.apiKeyService,
			initializers.webhookRegistryService
		] as unknown as ConstructorParameters<typeof StorageInitService>)
	);
	return { service, initializers };
};

describe('StorageInitService.initializeStorage (boot lock contract)', () => {
	it('seeds the defaults itself once the lock is acquired, using the boot retry budget', async () => {
		const mutex = new FakeMutexService('acquired');
		const { service, initializers } = buildService(mutex, null);

		await service.initializeStorage();

		expect(initializers.globalConfigService.initializeGlobalConfig).toHaveBeenCalledTimes(1);
		expect(initializers.userService.initializeAdminUser).toHaveBeenCalledTimes(1);
		expect(initializers.apiKeyService.initializeApiKey).toHaveBeenCalledTimes(1);
		expect(initializers.webhookRegistryService.initializeDefaultWebhook).toHaveBeenCalledTimes(1);
		expect(mutex.calls).toEqual([
			{
				key: expect.stringContaining('storage_initialization'),
				ttl: ms(INTERNAL_CONFIG.STORAGE_INIT_LOCK_TTL),
				maxAttempts: INTERNAL_CONFIG.STORAGE_INIT_LOCK_MAX_ATTEMPTS,
				delayMs: ms(INTERNAL_CONFIG.STORAGE_INIT_LOCK_RETRY_DELAY)
			}
		]);
	});

	it('re-checks and does nothing when a previous holder already initialized this project', async () => {
		const { service, initializers } = buildService(new FakeMutexService('acquired'), MEET_ENV.NAME_ID);

		await service.initializeStorage();

		expect(initializers.globalConfigService.initializeGlobalConfig).not.toHaveBeenCalled();
		expect(initializers.userService.initializeAdminUser).not.toHaveBeenCalled();
		expect(initializers.apiKeyService.initializeApiKey).not.toHaveBeenCalled();
		expect(initializers.webhookRegistryService.initializeDefaultWebhook).not.toHaveBeenCalled();
	});

	it('fails startup instead of skipping when the lock is never acquired within the budget', async () => {
		const { service, initializers } = buildService(new FakeMutexService('exhausted'), null);

		await expect(service.initializeStorage()).rejects.toThrow(
			'Unexpected error while Failed to initialize storage'
		);
		expect(initializers.globalConfigService.initializeGlobalConfig).not.toHaveBeenCalled();
	});
});
