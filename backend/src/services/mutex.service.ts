import ms from 'ms';
import Redlock, { Lock } from 'redlock';
import { inject, injectable } from 'inversify';
import { RedisService } from './redis.service.js';
import { LoggerService } from './logger.service.js';

export type RedisLock = Lock;
@injectable()
export class MutexService {
	protected redlockWithoutRetry: Redlock;
	protected readonly TTL_MS = ms('1m');
	protected LOCK_KEY_PREFIX = 'ov_meet_lock:';
	protected LOCK_REGISTRY_PREFIX = 'ov_meet_lock_registry:';

	constructor(
		@inject(RedisService) protected redisService: RedisService,
		@inject(LoggerService) protected logger: LoggerService
	) {
		// Create a Redlock instance with no retry strategy
		this.redlockWithoutRetry = this.redisService.createRedlock(0);
	}

	/**
	 * Acquires a lock for the specified resource.
	 * @param resource The resource to acquire a lock for.
	 * @param ttl The time-to-live (TTL) for the lock in milliseconds. Defaults to the TTL value of the MutexService.
	 * @returns A Promise that resolves to the acquired Lock object.
	 */
	async acquire(resource: string, ttl: number = this.TTL_MS): Promise<Lock | null> {
		const key = this.getLockKey(resource);
		const registryKey = this.getLockRegistryKey(resource);

		try {
			this.logger.debug(`Acquiring lock for resource: ${resource}`);
			const lock = await this.redlockWithoutRetry.acquire([key], ttl);

			// Store Lock data in Redis registry for support HA and release lock
			await this.redisService.set(
				registryKey,
				JSON.stringify({
					resources: lock.resources,
					value: lock.value,
					expiration: lock.expiration
				}),
				true
			);
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
		const key = this.getLockKey(resource);

		const lock = await this.getLockData(resource);

		if (!lock) {
			return;
		}

		if (lock) {
			this.logger.debug(`Releasing lock for resource: ${resource}`);

			try {
				await lock.release();
			} catch (error) {
				this.logger.error(`Error releasing lock for key ${key}:`, error);
			} finally {
				await this.redisService.delete(this.getLockRegistryKey(resource));
			}
		}
	}

	/**
	 * Returns the complete key used to acquire the lock in Redis.
	 */
	protected getLockKey(resource: string): string {
		return `${this.LOCK_KEY_PREFIX}${resource}`;
	}

	/**
	 * Generates a unique key for the lock registry by combining a predefined prefix
	 * with the specified resource identifier.
	 */
	protected getLockRegistryKey(resource: string): string {
		return `${this.LOCK_REGISTRY_PREFIX}${resource}`;
	}

	/**
	 * Retrieves the lock data for a given resource.
	 *
	 * This method first attempts to retrieve the lock from Redis. If the lock data is successfully retrieved from Redis,
	 * it constructs a new `Lock` instance and returns it. If the lock data cannot be found the method returns `null`.
	 *
	 * @param resource - The identifier of the resource for which the lock data is being retrieved.
	 * @returns A promise that resolves to the `Lock` instance if found, or `null` if the lock data is not available.
	 */
	protected async getLockData(resource: string): Promise<Lock | null> {
		const registryKey = this.getLockRegistryKey(resource);

		try {
			this.logger.debug(`Getting lock data in Redis for resource: ${resource}`);
			// Try to get lock from Redis
			const redisLockData = await this.redisService.get(registryKey);

			if (!redisLockData) {
				this.logger.error(`Cannot release lock. Lock not found for resource: ${resource}.`);
				return null;
			}

			const { resources, value, expiration } = JSON.parse(redisLockData);
			return new Lock(this.redlockWithoutRetry, resources, value, [], expiration);
		} catch (error) {
			this.logger.error(`Cannot release lock. Lock not found for resource: ${resource}.`);
			return null;
		}
	}
}
