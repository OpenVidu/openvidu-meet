import ms from 'ms';
import Redlock, { Lock } from 'redlock';
import { inject, injectable } from 'inversify';
import { RedisService } from './redis.service.js';
import { LoggerService } from './logger.service.js';
import { MeetLock } from '../helpers/redis.helper.js';

export type RedisLock = Lock;
@injectable()
export class MutexService {
	protected redlockWithoutRetry: Redlock;
	protected readonly TTL_MS = ms('1m');

	constructor(
		@inject(RedisService) protected redisService: RedisService,
		@inject(LoggerService) protected logger: LoggerService
	) {
		// Create a Redlock instance with no retry strategy
		this.redlockWithoutRetry = this.redisService.createRedlock(0);
	}

	/**
	 * Acquires a lock for the specified resource.
	 * @param key The resource to acquire a lock for.
	 * @param ttl The time-to-live (TTL) for the lock in milliseconds. Defaults to the TTL value of the MutexService.
	 * @returns A Promise that resolves to the acquired Lock object.
	 */
	async acquire(key: string, ttl: number = this.TTL_MS): Promise<Lock | null> {
		const registryKey = MeetLock.getRegistryLock(key);

		try {
			this.logger.debug(`Requesting lock: ${key}`);
			const lock = await this.redlockWithoutRetry.acquire([key], ttl);

			// Store Lock data in Redis registry for support HA and release lock
			await this.redisService.set(
				registryKey,
				JSON.stringify({
					resources: lock.resources,
					value: lock.value,
					expiration: lock.expiration,
					createdAt: Date.now()
				}),
				true
			);
			return lock;
		} catch (error) {
			this.logger.warn('Error acquiring lock:', error);
			return null;
		}
	}

	/**
	 * Releases a lock on a resource.
	 *
	 * @param key - The resource to release the lock on.
	 * @returns A Promise that resolves when the lock is released.
	 */
	async release(key: string): Promise<void> {
		const registryKey = MeetLock.getRegistryLock(key);
		const lock = await this.getLockData(registryKey);

		if (!lock) {
			this.logger.warn(`Lock not found for resource: ${key}. May be expired or released by another process.`);
			return;
		}

		if (lock) {
			try {
				await lock.release();
				this.logger.verbose(`Lock ${key} successfully released.`);
			} catch (error) {
				this.logger.error(`Error releasing lock for key ${key}:`, error);
			} finally {
				await this.redisService.delete(registryKey);
			}
		}
	}

	/**
	 * Retrieves all locks for a given prefix.
	 *
	 * This method retrieves all keys from Redis that match the specified prefix and returns an array of `Lock` instances.
	 *
	 * @param pattern - The prefix to filter the keys in Redis.
	 * @returns A promise that resolves to an array of `Lock` instances.
	 */
	async getLocksByPrefix(pattern: string): Promise<Lock[]> {
		const registryPattern = MeetLock.getRegistryLock(pattern);
		const keys = await this.redisService.getKeys(registryPattern);
		this.logger.debug(`Found ${keys.length} registry keys for pattern "${pattern}".`);

		if (keys.length === 0) {
			return [];
		}

		const lockPromises: Promise<Lock | null>[] = keys.map((key) => this.getLockData(key));

		const locksResult = await Promise.all(lockPromises);

		const locks = locksResult.filter((lock): lock is Lock => lock !== null);
		return locks;
	}

	lockExists(key: string): Promise<boolean> {
		const registryKey = MeetLock.getRegistryLock(key);
		return this.redisService.exists(registryKey);
	}

	/**
	 * Retrieves the creation timestamp of a lock identified by the given key.
	 *
	 * @param key - The unique identifier for the lock
	 * @returns A Promise that resolves to the creation timestamp (as a number) of the lock, or null if the lock doesn't exist or has expired
	 */
	async getLockCreatedAt(key: string): Promise<number | null> {
		const registryKey = MeetLock.getRegistryLock(key);

		const redisLockData = await this.redisService.get(registryKey);

		if (!redisLockData) {
			this.logger.warn(
				`Lock not found for resource: ${registryKey}. May be expired or released by another process.`
			);
			return null;
		}

		const { createdAt } = JSON.parse(redisLockData);
		return createdAt;
	}

	/**
	 * Retrieves the lock data for a given resource key.
	 *
	 * @param registryKey - The resource key to retrieve the lock data for.
	 * @returns A promise that resolves to a `Lock` instance or null if not found.
	 */
	protected async getLockData(registryKey: string): Promise<Lock | null> {
		try {
			// Try to get lock from Redis
			const redisLockData = await this.redisService.get(registryKey);

			if (!redisLockData) {
				return null;
			}

			const { resources, value, expiration } = JSON.parse(redisLockData);
			return new Lock(this.redlockWithoutRetry, resources, value, [], expiration);
		} catch (error) {
			return null;
		}
	}
}
