import { createLock, type IoredisAdapter } from 'redlock-universal';

/**
 * Shape of a lock entry persisted in the Redis registry for long-lived locks.
 *
 * Stored by {@link MutexService.acquireWithRegistry} and used to rebuild a
 * {@link RedisDistributedLock} on any backend instance so that a lock acquired
 * on one node can be released from another.
 */
export type RedisLockRegistryData = {
	resources: string[];
	value: string;
	expiration: number;
	createdAt: number;
};

/**
 * Distributed lock handle exposing the surface the {@link MutexService} and its
 * consumers depend on (`resources`, `value`, `expiration`, `release()`).
 *
 * It replaces the `Lock` class previously provided by the deprecated
 * `@sesamecare-oss/redlock`, and is deliberately reconstructible from data
 * persisted in the lock registry (resources + value) so that a lock acquired on
 * one backend instance can be released from another.
 */
export class RedisDistributedLock {
	constructor(
		public readonly engine: RedisRedlock,
		/** Resources (keys) protected by this lock. Single-key in practice. */
		public readonly resources: string[],
		/** Fencing token stored in Redis; a release only succeeds if it still matches. */
		public readonly value: string,
		/** Absolute expiration timestamp in ms (acquisition time + TTL). */
		public readonly expiration: number
	) {}

	/**
	 * Releases this lock. Value-fenced: it only removes the key while it still
	 * holds this lock's `value`, so a stale lock can never free a newer holder.
	 *
	 * @returns `true` if the key was removed, `false` if it was already gone or
	 * held by a different value.
	 */
	release(): Promise<boolean> {
		return this.engine.releaseLock(this);
	}
}

/**
 * Convenience alias for the lock handle exposed to services outside the lock
 * layer (recording, scheduled tasks, etc.).
 */
export type RedisLock = RedisDistributedLock;

/**
 * Thin distributed-lock engine backed by `redlock-universal`, preserving the
 * `acquire([key], ttl)` surface that `@sesamecare-oss/redlock`'s `Redlock`
 * exposed to {@link MutexService}.
 *
 * A single ioredis-backed adapter is shared across all acquisitions so the Lua
 * release/extend scripts stay cached (EVALSHA); each acquisition binds its own
 * key and TTL via `createLock`, which is a cheap, allocation-only operation.
 */
export class RedisRedlock {
	constructor(
		private readonly adapter: IoredisAdapter,
		/** Number of retries beyond the first attempt (matches the old `retryCount`). */
		private readonly retryAttempts: number,
		/** Delay between retries in ms. */
		private readonly retryDelay: number
	) {}

	/**
	 * Acquires a lock on the given resource for `ttl` milliseconds.
	 *
	 * Mirrors the old `Redlock.acquire([key], ttl)`: it throws when the lock
	 * cannot be acquired within the configured retry window, so callers keep
	 * their existing try/catch handling. Only single-resource locks are used in
	 * this codebase; the first resource is the lock key.
	 */
	async acquire(resources: string[], ttl: number): Promise<RedisDistributedLock> {
		const key = resources[0];
		const lock = createLock({
			adapter: this.adapter,
			key,
			ttl,
			retryAttempts: this.retryAttempts,
			retryDelay: this.retryDelay
		});
		// Throws LockAcquisitionError if the resource is already held (after retries).
		const handle = await lock.acquire();
		return new RedisDistributedLock(this, [key], handle.value, handle.acquiredAt + handle.ttl);
	}

	/**
	 * Value-fenced release used by {@link RedisDistributedLock.release}. Relies
	 * solely on the stored key + value (not on in-memory acquisition state), which
	 * is what makes cross-instance release from the registry possible.
	 */
	releaseLock(lock: RedisDistributedLock): Promise<boolean> {
		return this.adapter.delIfMatch(lock.resources[0], lock.value);
	}
}
