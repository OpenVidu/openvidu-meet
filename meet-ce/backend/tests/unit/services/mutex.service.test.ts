import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import { LockAcquisitionError } from 'redlock-universal';
import '../../../src/config/dependency-injector.config.js';
import { RedisDistributedLock, type RedisRedlock } from '../../../src/models/redis-lock.model.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import { MutexService } from '../../../src/services/mutex.service.js';
import type { RedisService } from '../../../src/services/redis.service.js';

/**
 * Stands in for Redis under the real MutexService: a single-key SET NX that expires after its TTL,
 * with a value-fenced release and extension, failing fast on contention the way the production
 * engine (no retries) does.
 */
class InMemoryLockRedisService {
	private readonly held = new Map<string, { value: string; expiresAt: number }>();

	createRedlock(): RedisRedlock {
		const engine = {
			acquire: async ([key]: string[], ttl: number): Promise<RedisDistributedLock> => {
				if (this.holder(key)) {
					throw new LockAcquisitionError(key, 1, new Error(`Lock "${key}" is already held`));
				}

				const value = randomUUID();
				this.held.set(key, { value, expiresAt: Date.now() + ttl });
				return new RedisDistributedLock(engine as unknown as RedisRedlock, [key], value, Date.now() + ttl);
			},
			releaseLock: async (lock: RedisDistributedLock): Promise<boolean> => {
				if (this.holder(lock.resources[0]) !== lock.value) {
					return false;
				}

				this.held.delete(lock.resources[0]);
				return true;
			},
			extendLock: async (lock: RedisDistributedLock, ttl: number): Promise<boolean> => {
				if (this.holder(lock.resources[0]) !== lock.value) {
					return false;
				}

				this.held.set(lock.resources[0], { value: lock.value, expiresAt: Date.now() + ttl });
				return true;
			}
		};
		return engine as unknown as RedisRedlock;
	}

	async exists(key: string): Promise<boolean> {
		return this.holder(key) !== undefined;
	}

	private holder(key: string): string | undefined {
		const entry = this.held.get(key);
		return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
	}
}

/** Redis that is not there: every acquisition fails and no key can be inspected. */
class UnreachableRedisService {
	createRedlock(): RedisRedlock {
		return {
			acquire: async ([key]: string[]): Promise<RedisDistributedLock> => {
				throw new LockAcquisitionError(key, 1, new Error('connect ECONNREFUSED 127.0.0.1:6379'));
			}
		} as unknown as RedisRedlock;
	}

	async exists(): Promise<boolean> {
		return false;
	}
}

const buildLogger = () => {
	const lines: Record<'warn' | 'debug', string[]> = { warn: [], debug: [] };
	const logger = {
		info: () => {},
		error: () => {},
		verbose: () => {},
		warn: (message: string) => lines.warn.push(message),
		debug: (message: string) => lines.debug.push(message)
	};
	return { logger: logger as unknown as LoggerService, lines };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('MutexService', () => {
	const KEY = 'ov_meet_lock:scheduled_task_expiredRoomsGC';

	afterEach(() => {
		jest.useRealTimers();
	});

	it('keeps the lock for as long as its holder runs, past the TTL, and frees it once it finishes', async () => {
		jest.useFakeTimers({ now: 0 });
		const mutex = new MutexService(new InMemoryLockRedisService() as unknown as RedisService, buildLogger().logger);
		let release!: () => void;
		const holder = mutex.withLock(
			KEY,
			1000,
			() => new Promise<string>((resolve) => (release = () => resolve('done')))
		);

		await jest.advanceTimersByTimeAsync(3500);
		expect(await mutex.withLock(KEY, 1000, async () => 'taken')).toBeNull();

		release();
		expect(await holder).toBe('done');
		await jest.advanceTimersByTimeAsync(3500);
		expect(await mutex.withLock(KEY, 1000, async () => 'taken')).toBe('taken');
	});

	it('reports a lock held by another contender as expected, not as a warning', async () => {
		const { logger, lines } = buildLogger();
		const mutex = new MutexService(new InMemoryLockRedisService() as unknown as RedisService, logger);
		let release!: () => void;
		const holder = mutex.withLock(
			KEY,
			1000,
			() => new Promise<string>((resolve) => (release = () => resolve('done')))
		);
		await flush();

		const contender = await mutex.withLock(KEY, 1000, async () => 'never');
		release();

		expect(contender).toBeNull();
		expect(await holder).toBe('done');
		expect(lines.warn).toEqual([]);
		expect(lines.debug.some((line) => line.includes(KEY))).toBe(true);
	});

	it('keeps warning when the lock could not be taken for any other reason', async () => {
		const { logger, lines } = buildLogger();
		const mutex = new MutexService(new UnreachableRedisService() as unknown as RedisService, logger);

		const result = await mutex.withLock(KEY, 1000, async () => 'never');

		expect(result).toBeNull();
		expect(lines.warn.some((line) => line.includes(KEY))).toBe(true);
	});

	it('does not warn on the retries of a contended lock either', async () => {
		const { logger, lines } = buildLogger();
		const mutex = new MutexService(new InMemoryLockRedisService() as unknown as RedisService, logger);
		let release!: () => void;
		const holder = mutex.withLock(
			KEY,
			1000,
			() => new Promise<string>((resolve) => (release = () => resolve('done')))
		);
		await flush();

		const contender = await mutex.withRetryLock(KEY, 1000, async () => 'never', 2, 5);
		release();

		expect(contender).toBeNull();
		expect(await holder).toBe('done');
		expect(lines.warn).toEqual([]);
	});

	it('retries a held lock until its holder frees it', async () => {
		jest.useFakeTimers({ now: 0 });
		const mutex = new MutexService(new InMemoryLockRedisService() as unknown as RedisService, buildLogger().logger);
		let release!: () => void;
		const holder = mutex.withLock(
			KEY,
			10_000,
			() => new Promise<string>((resolve) => (release = () => resolve('done')))
		);
		await jest.advanceTimersByTimeAsync(0);

		const contender = mutex.withRetryLock(KEY, 10_000, async () => 'taken', 3, 100);
		await jest.advanceTimersByTimeAsync(150);
		release();
		await holder;
		await jest.advanceTimersByTimeAsync(100);

		expect(await contender).toBe('taken');
	});

	it('gives up after its last attempt without waiting once more', async () => {
		jest.useFakeTimers({ now: 0 });
		const mutex = new MutexService(new InMemoryLockRedisService() as unknown as RedisService, buildLogger().logger);
		void mutex.withLock(KEY, 60_000, () => new Promise<never>(() => {}));
		await jest.advanceTimersByTimeAsync(0);

		let result: string | null | undefined;
		void mutex.withRetryLock(KEY, 60_000, async () => 'taken', 3, 100).then((value) => (result = value));

		await jest.advanceTimersByTimeAsync(199);
		expect(result).toBeUndefined();
		await jest.advanceTimersByTimeAsync(1);
		expect(result).toBeNull();
	});

	it('warns when a holder that is still running has lost its lock', async () => {
		jest.useFakeTimers({ now: 0 });
		const { logger, lines } = buildLogger();
		const redis = new InMemoryLockRedisService();
		const mutex = new MutexService(redis as unknown as RedisService, logger);
		let release!: () => void;
		const holder = mutex.withLock(KEY, 1000, () => new Promise<void>((resolve) => (release = resolve)));
		await jest.advanceTimersByTimeAsync(0);
		(redis as unknown as { held: Map<string, unknown> }).held.set(KEY, { value: 'thief', expiresAt: 10_000 });

		await jest.advanceTimersByTimeAsync(500);
		release();
		await holder;

		expect(lines.warn).toEqual([`Lock '${KEY}' was lost while its holder still ran`]);
		expect(await redis.exists(KEY)).toBe(true);
	});
});

/**
 * Redis for the registry of long-lived locks: the lock keys of {@link InMemoryLockRedisService} plus
 * plain keys for the registry entries that let another replica release a lock it did not take.
 */
class RegistryRedisService extends InMemoryLockRedisService {
	readonly entries = new Map<string, string>();
	failWrites = false;

	async set(key: string, value: string): Promise<void> {
		if (this.failWrites) throw new Error('Redis write failed');

		this.entries.set(key, value);
	}

	async get(key: string): Promise<string | null> {
		return this.entries.get(key) ?? null;
	}

	async getMany(keys: string[]): Promise<(string | null)[]> {
		return keys.map((key) => this.entries.get(key) ?? null);
	}

	async getKeys(pattern: string): Promise<string[]> {
		const prefix = pattern.replace(/\*$/, '');
		return [...this.entries.keys()].filter((key) => key.startsWith(prefix));
	}

	async delete(key: string): Promise<number> {
		return this.entries.delete(key) ? 1 : 0;
	}

	async existsMany(keys: string[]): Promise<boolean[]> {
		return Promise.all(keys.map((key) => this.exists(key)));
	}
}

describe('MutexService lock registry', () => {
	const KEY = 'ov_meet_lock:recording_active_room-1';
	const REGISTRY_KEY = `ov_meet_lock_registry:${KEY}`;

	const build = () => {
		const redis = new RegistryRedisService();
		const { logger, lines } = buildLogger();
		return { redis, lines, mutex: new MutexService(redis as unknown as RedisService, logger) };
	};

	/* eslint-disable @typescript-eslint/no-deprecated */
	it('lets another replica see, date and release a lock it did not take', async () => {
		const { redis, mutex } = build();
		const holder = new MutexService(redis as unknown as RedisService, buildLogger().logger);
		const before = Date.now();

		expect(await holder.acquireWithRegistry(KEY, 60_000)).not.toBeNull();

		expect(await mutex.lockRegistryExists(KEY)).toBe(true);
		expect(await mutex.getLockCreatedAtFromRegistry(KEY)).toBeGreaterThanOrEqual(before);
		expect(await mutex.getRegistryLocksByPrefix('ov_meet_lock:recording_active_*')).toHaveLength(1);

		await mutex.releaseWithRegistry(KEY);

		expect(await redis.exists(KEY)).toBe(false);
		expect(redis.entries.has(REGISTRY_KEY)).toBe(false);
		expect(await mutex.lockRegistryExists(KEY)).toBe(false);
		expect(await mutex.getLockCreatedAtFromRegistry(KEY)).toBeNull();
	});

	it('gives the lock back when it cannot record it in the registry', async () => {
		const { redis, mutex } = build();
		redis.failWrites = true;

		expect(await mutex.acquireWithRegistry(KEY, 60_000)).toBeNull();
		expect(await redis.exists(KEY)).toBe(false);
	});

	it('returns no lock, without throwing, when it can neither record nor give back the lock', async () => {
		const { redis, mutex, lines } = build();
		redis.failWrites = true;
		const engine = {
			acquire: async ([key]: string[], ttl: number) =>
				new RedisDistributedLock(engine as unknown as RedisRedlock, [key], 'v', Date.now() + ttl),
			releaseLock: async () => Promise.reject(new Error('Redis down'))
		};
		Object.assign(mutex, { redlockWithoutRetry: engine });
		const error = jest.fn();
		Object.assign(mutex, { logger: { ...buildLogger().logger, warn: (m: string) => lines.warn.push(m), error } });

		await expect(mutex.acquireWithRegistry(KEY, 60_000)).resolves.toBeNull();
		expect(lines.warn).toEqual([expect.stringContaining(`Error storing lock registry for key '${KEY}'`)]);
		expect(error).toHaveBeenCalledWith(`Error rolling back lock acquisition for key '${KEY}'`, expect.any(Error));
	});

	it('deletes the registry entry even when giving back its lock fails', async () => {
		const { redis, mutex } = build();
		await mutex.acquireWithRegistry(KEY, 60_000);
		Object.assign(mutex, {
			redlockWithoutRetry: { releaseLock: async () => Promise.reject(new Error('Redis down')) }
		});

		await mutex.releaseWithRegistry(KEY);

		expect(redis.entries.has(REGISTRY_KEY)).toBe(false);
	});

	it('reports no lock when the registry cannot be read', async () => {
		const { redis, mutex } = build();
		await mutex.acquireWithRegistry(KEY, 60_000);
		redis.get = async () => Promise.reject(new Error('Redis down'));

		expect(await mutex.lockRegistryExists(KEY)).toBe(false);
		expect(await mutex.getLockCreatedAtFromRegistry(KEY)).toBeNull();
	});

	it('refuses a lock that is already held, leaving its registry entry alone', async () => {
		const { redis, mutex } = build();
		await mutex.acquireWithRegistry(KEY, 60_000);
		const entry = redis.entries.get(REGISTRY_KEY);

		expect(await mutex.acquireWithRegistry(KEY, 60_000)).toBeNull();
		expect(redis.entries.get(REGISTRY_KEY)).toBe(entry);
	});

	it('reports releasing a lock that is gone without touching anything', async () => {
		const { redis, mutex, lines } = build();

		await mutex.releaseWithRegistry(KEY);

		expect(redis.entries.size).toBe(0);
		expect(lines.warn).toEqual([expect.stringContaining(`Lock not found for resource: ${KEY}`)]);
	});

	const valid = { resources: [KEY], value: 'v', expiration: 9e15, createdAt: 1 };

	it.each([
		['is not JSON', '{'],
		['is JSON null', 'null'],
		['is not an object', '"text"'],
		['has no resource list', JSON.stringify({ ...valid, resources: KEY })],
		['has an empty resource', JSON.stringify({ ...valid, resources: [KEY, ''] })],
		['has a resource that is not a string', JSON.stringify({ ...valid, resources: [KEY, 7] })],
		['has no value', JSON.stringify({ ...valid, value: undefined })],
		['has no expiration', JSON.stringify({ ...valid, expiration: '9e15' })],
		['has no creation date', JSON.stringify({ ...valid, createdAt: undefined })],
		['has expired', JSON.stringify({ ...valid, expiration: 1 })]
	])('treats a registry entry that %s as no lock, even while its lock is held, and deletes it', async (_case, payload) => {
		const { redis, mutex } = build();
		await mutex.acquireWithRegistry(KEY, 60_000);

		redis.entries.set(REGISTRY_KEY, payload);
		expect(await mutex.lockRegistryExists(KEY)).toBe(false);
		expect(redis.entries.has(REGISTRY_KEY)).toBe(false);

		redis.entries.set(REGISTRY_KEY, payload);
		expect(await mutex.getRegistryLocksByPrefix('ov_meet_lock:recording_active_*')).toEqual([]);
		expect(redis.entries.has(REGISTRY_KEY)).toBe(false);
	});

	it('treats a registry entry whose lock is no longer held as no lock, and deletes it', async () => {
		const { redis, mutex } = build();
		redis.entries.set(REGISTRY_KEY, JSON.stringify(valid));

		expect(await mutex.lockRegistryExists(KEY)).toBe(false);
		expect(redis.entries.has(REGISTRY_KEY)).toBe(false);

		redis.entries.set(REGISTRY_KEY, JSON.stringify(valid));
		expect(await mutex.getRegistryLocksByPrefix('ov_meet_lock:recording_active_*')).toEqual([]);
		expect(redis.entries.has(REGISTRY_KEY)).toBe(false);
	});

	it('lists only the valid locks among more registry entries than one batch reads', async () => {
		const { redis, mutex } = build();
		Object.assign(mutex, { LOCK_REGISTRY_BATCH_SIZE: 10 });
		const keys = Array.from({ length: 25 }, (_, index) => `ov_meet_lock:recording_active_room-${index}`);

		for (const key of keys) {
			await mutex.acquireWithRegistry(key, 60_000);
		}

		redis.entries.set('ov_meet_lock_registry:ov_meet_lock:recording_active_broken', '{');

		const locks = await mutex.getRegistryLocksByPrefix('ov_meet_lock:recording_active_*');

		expect(locks.map((lock) => lock.resources[0]).sort()).toEqual([...keys].sort());
		expect(redis.entries.size).toBe(25);
	});
	/* eslint-enable @typescript-eslint/no-deprecated */
});
