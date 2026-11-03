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
});
