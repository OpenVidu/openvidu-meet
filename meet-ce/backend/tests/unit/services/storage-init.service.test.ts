import { describe, expect, it, jest } from '@jest/globals';
import { Container } from 'inversify';
import ms from 'ms';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import { createStorageModule } from '../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../src/environment.js';
import { ABSService } from '../../../src/services/storage/providers/abs/abs.service.js';
import { GCSService } from '../../../src/services/storage/providers/gcp/gcs.service.js';
import { S3Service } from '../../../src/services/storage/providers/s3/s3.service.js';
import { StorageInitService } from '../../../src/services/storage/storage-init.service.js';
import { UserService } from '../../../src/services/user.service.js';

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

/**
 * The root admin is seeded from MEET_INITIAL_ADMIN_USER and MEET_INITIAL_ADMIN_PASSWORD, and a value below the
 * login minimum would create an account nobody can log in to. The password only matters when the account is
 * created, so an existing root admin starts whatever the variable holds.
 */
describe('UserService.initializeAdminUser (root admin configuration)', () => {
	const buildUserService = (existingUserId?: string) => {
		const userRepository = {
			findByUserId: jest.fn(async (userId: string) => (userId === existingUserId ? { userId } : null)),
			create: jest.fn(async (user: unknown) => user)
		};
		const service = new UserService(
			...([noopLogger, userRepository] as unknown as ConstructorParameters<typeof UserService>)
		);
		return { service, userRepository };
	};

	const withAdminConfig = async (userId: string, password: string, run: () => Promise<void>) => {
		const { INITIAL_ADMIN_USER, INITIAL_ADMIN_PASSWORD } = MEET_ENV;
		Object.assign(MEET_ENV, { INITIAL_ADMIN_USER: userId, INITIAL_ADMIN_PASSWORD: password });

		try {
			await run();
		} finally {
			Object.assign(MEET_ENV, { INITIAL_ADMIN_USER, INITIAL_ADMIN_PASSWORD });
		}
	};

	it('refuses a root admin user ID shorter than the login minimum', async () => {
		const { service, userRepository } = buildUserService('root');

		await withAdminConfig('root', 'password', async () => {
			await expect(service.initializeAdminUser()).rejects.toThrow(
				'MEET_INITIAL_ADMIN_USER must be at least 5 characters long'
			);
		});
		expect(userRepository.create).not.toHaveBeenCalled();
	});

	it('refuses to create the root admin with a password shorter than the login minimum', async () => {
		const { service, userRepository } = buildUserService();

		await withAdminConfig('rootadmin', '1234', async () => {
			await expect(service.initializeAdminUser()).rejects.toThrow(
				'MEET_INITIAL_ADMIN_PASSWORD must be at least 5 characters long'
			);
		});
		expect(userRepository.create).not.toHaveBeenCalled();
	});

	it('starts with a short password when the root admin already exists, and leaves it untouched', async () => {
		const { service, userRepository } = buildUserService('rootadmin');

		await withAdminConfig('rootadmin', '1234', () => service.initializeAdminUser());
		expect(userRepository.create).not.toHaveBeenCalled();
	});
});

describe('MEET_BLOB_STORAGE_MODE (storage provider selection)', () => {
	const readStorageMode = async (value: string) => {
		const original = process.env.MEET_BLOB_STORAGE_MODE;
		process.env.MEET_BLOB_STORAGE_MODE = value;
		jest.resetModules();

		try {
			const { MEET_ENV: env } = await import('../../../src/environment.js');
			return env.BLOB_STORAGE_MODE;
		} finally {
			if (original === undefined) {
				delete process.env.MEET_BLOB_STORAGE_MODE;
			} else {
				process.env.MEET_BLOB_STORAGE_MODE = original;
			}
		}
	};

	it.each([
		['GCS', GCSService],
		[' abs ', ABSService],
		['', S3Service]
	])('selects the provider of %j', async (value, providerService) => {
		const storage = new Container();
		storage.load(createStorageModule(await readStorageMode(value)));

		expect(storage.isBound(providerService)).toBe(true);
	});

	it('refuses an unknown value naming the variable and the accepted values', async () => {
		const mode = await readStorageMode('gsc');

		expect(() => new Container().load(createStorageModule(mode))).toThrow(
			"MEET_BLOB_STORAGE_MODE must be 's3', 'gcs' or 'abs', got 'gsc'"
		);
	});
});
