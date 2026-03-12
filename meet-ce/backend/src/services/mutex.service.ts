import { Lock, Redlock } from '@sesamecare-oss/redlock';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { MeetLock } from '../helpers/redis.helper.js';
import { LoggerService } from './logger.service.js';
import { RedisService } from './redis.service.js';

export type RedisLock = Lock;
type RedisLockRegistryData = {
	resources: string[];
	value: string;
	expiration: number;
	createdAt: number;
};

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
	 * This method uses the Redlock library to acquire a distributed lock on a resource identified by the key.
	 * The request will return null if the lock cannot be acquired.
	 *
	 * @param key The resource to acquire a lock for.
	 * @param ttl The time-to-live (TTL) for the lock in milliseconds. Defaults to the TTL value of the MutexService.
	 * @returns A Promise that resolves to the acquired Lock object. If the lock cannot be acquired, it resolves to null.
	 */
	async acquire(key: string, ttl: number = this.TTL_MS): Promise<Lock | null> {
		const registryKey = MeetLock.getRegistryLock(key);

		try {
			this.logger.debug(`Requesting lock: ${key}`);
			const lock = await this.redlockWithoutRetry.acquire([key], ttl);

			try {
				// Store lock details in the registry for later retrieval and management in others instances
				await this.redisService.set(
					registryKey,
					JSON.stringify({
						resources: lock.resources,
						value: lock.value,
						expiration: lock.expiration,
						createdAt: Date.now()
					}),
					ttl
				);
				return lock;
			} catch (error) {
				this.logger.error(`Error storing lock registry for key ${key}:`, error);

				try {
					await lock.release();
				} catch (releaseError) {
					this.logger.error(`Error rolling back lock acquisition for key ${key}:`, releaseError);
				}

				return null;
			}
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
		const lock = await this.buildLock(registryKey);

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

		const lockPromises: Promise<Lock | null>[] = keys.map((key) => this.buildLock(key));

		const locksResult = await Promise.all(lockPromises);

		const locks = locksResult.filter((lock): lock is Lock => lock !== null);
		return locks;
	}

	/**
	 * Attempts to acquire a lock, retrying up to `maxAttempts` times with a fixed delay between
	 * attempts. Intended for fire-and-forget flows (e.g. webhooks) where the caller has no
	 * opportunity to retry externally and a missed lock acquisition would leave the system in an
	 * inconsistent state.
	 *
	 * @param key - The resource to acquire a lock for.
	 * @param ttl - The time-to-live for the lock in milliseconds.
	 * @param maxAttempts - Maximum number of acquisition attempts. Defaults to 3.
	 * @param delayMs - Fixed delay in milliseconds between attempts. Defaults to 200.
	 * @returns A Promise that resolves to the acquired Lock, or null if all attempts fail.
	 */
	async acquireWithRetry(key: string, ttl: number = this.TTL_MS, maxAttempts = 3, delayMs = 200): Promise<Lock | null> {
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			const lock = await this.acquire(key, ttl);

			if (lock) return lock;

			if (attempt < maxAttempts) {
				this.logger.warn(`Lock '${key}' attempt ${attempt}/${maxAttempts} failed. Retrying in ${delayMs}ms...`);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}

		return null;
	}

	lockExists(key: string): Promise<boolean> {
		const registryKey = MeetLock.getRegistryLock(key);
		return this.hasActiveLock(registryKey);
	}

	/**
	 * Retrieves the creation timestamp of a lock identified by the given key.
	 *
	 * @param key - The unique identifier for the lock
	 * @returns A Promise that resolves to the creation timestamp (as a number) of the lock, or null if the lock doesn't exist or has expired
	 */
	async getLockCreatedAt(key: string): Promise<number | null> {
		const registryKey = MeetLock.getRegistryLock(key);
		const redisLockData = await this.getRegistryLockData(registryKey);

		if (!redisLockData) {
			this.logger.warn(
				`Lock not found for resource: ${registryKey}. May be expired or released by another process.`
			);
			return null;
		}

		const { createdAt } = redisLockData;
		return createdAt;
	}

	/**
	 * Builds a Lock instance from the lock data stored in the registry for the given key.
	 *
	 * @param registryKey - The resource key to retrieve the lock data for.
	 * @returns A promise that resolves to a `Lock` instance or null if not found.
	 */
	protected async buildLock(registryKey: string): Promise<Lock | null> {
		const registryLockData = await this.getRegistryLockData(registryKey);

		if (!registryLockData) {
			return null;
		}

		const { resources, value, expiration } = registryLockData;
		return new Lock(this.redlockWithoutRetry, resources, value, [], expiration);
	}

	protected async getRegistryLockData(registryKey: string): Promise<RedisLockRegistryData | null> {
		let redisLockData: string | null;

		try {
			redisLockData = await this.redisService.get(registryKey);
		} catch (error) {
			this.logger.warn(`Error reading lock registry '${registryKey}': ${error}`);
			return null;
		}

		if (!redisLockData) {
			return null;
		}

		let parsedLockData: unknown;

		try {
			parsedLockData = JSON.parse(redisLockData);
		} catch {
			await this.cleanupRegistryKey(registryKey, 'registry payload is invalid JSON');
			return null;
		}

		if (!this.isValidRegistryLockData(parsedLockData)) {
			await this.cleanupRegistryKey(registryKey, 'registry payload is incomplete');
			return null;
		}

		if (parsedLockData.expiration <= Date.now()) {
			await this.cleanupRegistryKey(registryKey, 'registry lock is expired');
			return null;
		}

		const resourcesExist = await Promise.all(parsedLockData.resources.map((resource) => this.redisService.exists(resource)));

		if (resourcesExist.some((exists) => !exists)) {
			await this.cleanupRegistryKey(registryKey, 'lock resources are missing');
			return null;
		}

		return parsedLockData;
	}

	protected async hasActiveLock(registryKey: string): Promise<boolean> {
		const lockData = await this.getRegistryLockData(registryKey);
		return !!lockData;
	}


	/**
	 * Validates the structure of the lock data retrieved from the registry to ensure it contains all necessary fields with correct types.
	 * @param lockData - The lock data object to validate.
	 * @returns A boolean indicating whether the lock data is valid.
	 */
	protected isValidRegistryLockData(lockData: unknown): lockData is RedisLockRegistryData {
		if (!lockData || typeof lockData !== 'object') {
			return false;
		}

		const candidate = lockData as Partial<RedisLockRegistryData>;
		return (
			Array.isArray(candidate.resources) &&
			candidate.resources.every((resource) => typeof resource === 'string' && resource.length > 0) &&
			typeof candidate.value === 'string' &&
			typeof candidate.expiration === 'number' &&
			typeof candidate.createdAt === 'number'
		);
	}

	protected async cleanupRegistryKey(registryKey: string, reason: string): Promise<void> {
		try {
			await this.redisService.delete(registryKey);
			this.logger.debug(`Deleted orphaned lock registry '${registryKey}': ${reason}`);
		} catch (error) {
			this.logger.warn(`Error deleting lock registry '${registryKey}': ${error}`);
		}
	}
}
