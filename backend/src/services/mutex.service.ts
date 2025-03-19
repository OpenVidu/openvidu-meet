import Redlock, { Lock } from 'redlock';
import { RedisService } from './redis.service.js';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { LoggerService } from './logger.service.js';

export type RedisLock = Lock;
@injectable()
export class MutexService {
	protected redlockWithoutRetry: Redlock;
	protected locks: Map<string, Lock>;
	protected readonly TTL_MS = ms('1m');
	protected LOCK_KEY_PREFIX = 'ov_meet_lock:';

	constructor(
		@inject(RedisService) protected redisService: RedisService,
		@inject(LoggerService) protected logger: LoggerService
	) {
		// Create a Redlock instance with no retry strategy
		this.redlockWithoutRetry = this.redisService.createRedlock(0);
		this.locks = new Map();
	}

	/**
	 * Acquires a lock for the specified resource.
	 * @param resource The resource to acquire a lock for.
	 * @param ttl The time-to-live (TTL) for the lock in milliseconds. Defaults to the TTL value of the MutexService.
	 * @returns A Promise that resolves to the acquired Lock object.
	 */
	async acquire(resource: string, ttl: number = this.TTL_MS): Promise<Lock | null> {
		const key = this.LOCK_KEY_PREFIX + resource;

		try {
			this.logger.debug(`Acquiring lock for resource: ${resource}`);
			const lock = await this.redlockWithoutRetry.acquire([key], ttl);
			this.locks.set(key, lock);
			return lock;
		} catch (error) {
			this.logger.error('Error acquiring lock:', error);
			return null;
		}
	}

	/**
	 * Releases a lock on a resource.
	 *
	 * @param resource - The resource to release the lock on.
	 * @returns A Promise that resolves when the lock is released.
	 */
	async release(resource: string): Promise<void> {
		const key = this.LOCK_KEY_PREFIX + resource;
		const lock = this.locks.get(key);

		if (lock) {
			this.logger.debug(`Releasing lock for resource: ${resource}`);

			try {
				await lock.release();
			} catch (error) {
				this.logger.error(`Error releasing lock for key ${key}:`, error);
			} finally {
				this.locks.delete(key);
			}
		}
	}
}
