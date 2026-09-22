import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { MeetWebhook, MeetWebhookOptions } from '@openvidu-meet/typings';
import { randomUUID } from 'crypto';
import { LockAcquisitionError } from 'redlock-universal';
import '../../../src/config/dependency-injector.config.js';
import { setInternalConfig } from '../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../src/environment.js';
import { OpenViduMeetError } from '../../../src/models/error.model.js';
import { RedisDistributedLock, type RedisRedlock } from '../../../src/models/redis-lock.model.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import { MutexService } from '../../../src/services/mutex.service.js';
import type { RedisService } from '../../../src/services/redis.service.js';
import { WebhookRegistryService } from '../../../src/services/webhook-registry.service.js';

/**
 * Real in-memory stand-in for WebhookRepository: count() and create() are genuine async
 * operations over shared state, with an artificial delay on create() so two concurrent
 * createWebhook() calls interleave the same way two concurrent Mongo requests would — both
 * counting before either's insert commits.
 */
class FakeWebhookRepository {
	documents: MeetWebhook[] = [];

	async count(): Promise<number> {
		return this.documents.length;
	}

	async create(webhook: MeetWebhook): Promise<MeetWebhook> {
		await new Promise((resolve) => setTimeout(resolve, 10));
		this.documents.push(webhook);
		return webhook;
	}
}

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

/**
 * Stands in for Redis under the real MutexService: a single-key SET NX with a value-fenced release,
 * failing fast on contention the way the production engine (no retries) does.
 */
class InMemoryLockRedisService {
	private readonly held = new Map<string, string>();

	createRedlock(): RedisRedlock {
		const engine = {
			acquire: async ([key]: string[], ttl: number): Promise<RedisDistributedLock> => {
				if (this.held.has(key)) {
					throw new LockAcquisitionError(key, 1, new Error(`Lock "${key}" is already held`));
				}

				const value = randomUUID();
				this.held.set(key, value);
				return new RedisDistributedLock(engine as unknown as RedisRedlock, [key], value, Date.now() + ttl);
			},
			releaseLock: async (lock: RedisDistributedLock): Promise<boolean> => {
				if (this.held.get(lock.resources[0]) !== lock.value) {
					return false;
				}

				this.held.delete(lock.resources[0]);
				return true;
			}
		};
		return engine as unknown as RedisRedlock;
	}

	async exists(key: string): Promise<boolean> {
		return this.held.has(key);
	}
}

const realMutexOverFakeRedis = () =>
	new MutexService(new InMemoryLockRedisService() as unknown as RedisService, noopLogger as unknown as LoggerService);

describe('WebhookRegistryService.createWebhook (registration count-then-create race)', () => {
	it('never lets two concurrent registrations both slip past the cap', async () => {
		setInternalConfig({ WEBHOOK_MAX_ENDPOINTS: 1 });

		try {
			const repository = new FakeWebhookRepository();
			const service = new WebhookRegistryService(
				...([noopLogger, repository, {}, realMutexOverFakeRedis()] as unknown as ConstructorParameters<
					typeof WebhookRegistryService
				>)
			);

			const options: MeetWebhookOptions = { url: 'https://example.com/hook' };
			const results = await Promise.allSettled([service.createWebhook(options), service.createWebhook(options)]);

			const fulfilled = results.filter((result) => result.status === 'fulfilled');
			const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

			expect(repository.documents).toHaveLength(1);
			expect(fulfilled).toHaveLength(1);
			expect(rejected).toHaveLength(1);
			expect(rejected[0].reason).toBeInstanceOf(OpenViduMeetError);
			expect((rejected[0].reason as OpenViduMeetError).statusCode).toBe(409);
			expect((rejected[0].reason as OpenViduMeetError).message).toContain('maximum number');
		} finally {
			setInternalConfig({ WEBHOOK_MAX_ENDPOINTS: 10 });
		}
	});

	it('registers a webhook the caller said nothing about as enabled', async () => {
		const repository = new FakeWebhookRepository();
		const service = new WebhookRegistryService(
			...([noopLogger, repository, {}, realMutexOverFakeRedis()] as unknown as ConstructorParameters<
				typeof WebhookRegistryService
			>)
		);

		const webhook = await service.createWebhook({ url: 'https://example.com/hook' });

		expect(webhook.enabled).toBe(true);
	});

	it('waits for a registration in progress instead of turning the caller away', async () => {
		const repository = new FakeWebhookRepository();
		const service = new WebhookRegistryService(
			...([noopLogger, repository, {}, realMutexOverFakeRedis()] as unknown as ConstructorParameters<
				typeof WebhookRegistryService
			>)
		);

		const results = await Promise.allSettled(
			[1, 2, 3].map((i) => service.createWebhook({ url: `https://example.com/hook-${i}` }))
		);

		expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
		expect(repository.documents).toHaveLength(3);
	});
});

/**
 * Storage initialization runs on every start, so the seed must leave an already-seeded deployment
 * alone and must not stop the start over a value the registry refuses.
 */
describe('WebhookRegistryService.initializeDefaultWebhook (runs on every start)', () => {
	const initialUrl = 'https://initial.example.com/hook';
	const originalUrl = MEET_ENV.INITIAL_WEBHOOK_URL;
	const originalEnabled = MEET_ENV.INITIAL_WEBHOOK_ENABLED;
	const originalApiKey = MEET_ENV.INITIAL_API_KEY;

	const seededService = (repository: FakeWebhookRepository) =>
		new WebhookRegistryService(
			...([noopLogger, repository, {}, realMutexOverFakeRedis()] as unknown as ConstructorParameters<
				typeof WebhookRegistryService
			>)
		);

	beforeEach(() => {
		MEET_ENV.INITIAL_WEBHOOK_URL = initialUrl;
	});

	afterEach(() => {
		MEET_ENV.INITIAL_WEBHOOK_URL = originalUrl;
		MEET_ENV.INITIAL_WEBHOOK_ENABLED = originalEnabled;
		MEET_ENV.INITIAL_API_KEY = originalApiKey;
	});

	// A webhook is delivered signed with the API key, so one cannot be enabled without a key to sign with.
	it.each([
		['enabled when the deployment asked for it and can sign it', 'true', 'initial-api-key', true],
		['disabled when no API key can sign its deliveries', 'true', '', false],
		['disabled when the deployment did not ask for it', 'false', 'initial-api-key', false]
	])('registers it %s', async (_case, enabled, apiKey, expected) => {
		MEET_ENV.INITIAL_WEBHOOK_ENABLED = enabled;
		MEET_ENV.INITIAL_API_KEY = apiKey;
		const repository = new FakeWebhookRepository();

		await seededService(repository).initializeDefaultWebhook();

		expect(repository.documents[0].enabled).toBe(expected);
	});

	it('registers the configured webhook on a deployment that has none', async () => {
		const repository = new FakeWebhookRepository();

		await seededService(repository).initializeDefaultWebhook();

		expect(repository.documents).toHaveLength(1);
		expect(repository.documents[0].url).toBe(initialUrl);
	});

	it('does not register the same URL twice', async () => {
		const repository = new FakeWebhookRepository();
		const service = seededService(repository);

		await service.initializeDefaultWebhook();
		await service.initializeDefaultWebhook();

		expect(repository.documents).toHaveLength(1);
	});

	it('leaves a deployment that already registered a webhook of its own alone', async () => {
		const repository = new FakeWebhookRepository();
		const service = seededService(repository);

		await service.createWebhook({ url: 'https://elsewhere.example.com/hook' });
		await service.initializeDefaultWebhook();

		expect(repository.documents.map((webhook) => webhook.url)).toEqual(['https://elsewhere.example.com/hook']);
	});

	it('skips a URL that is not http(s) instead of failing the start', async () => {
		MEET_ENV.INITIAL_WEBHOOK_URL = 'ftp://initial.example.com/hook';
		const repository = new FakeWebhookRepository();

		await expect(seededService(repository).initializeDefaultWebhook()).resolves.toBeUndefined();

		expect(repository.documents).toHaveLength(0);
	});

	it('skips a registration the registry refuses instead of failing the start', async () => {
		const repository = new FakeWebhookRepository();
		const service = new WebhookRegistryService(
			...([noopLogger, repository, {}, { withRetryLock: async () => null }] as unknown as ConstructorParameters<
				typeof WebhookRegistryService
			>)
		);

		await expect(service.initializeDefaultWebhook()).resolves.toBeUndefined();

		expect(repository.documents).toHaveLength(0);
	});

	it('still fails the start on an error that is not a registration refusal', async () => {
		const repository = new FakeWebhookRepository();
		repository.create = async () => {
			throw new Error('database unavailable');
		};

		await expect(seededService(repository).initializeDefaultWebhook()).rejects.toThrow('database unavailable');
	});
});
