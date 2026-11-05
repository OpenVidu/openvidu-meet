import { afterEach, describe, expect, it } from '@jest/globals';
import type { MeetApiKey } from '@openvidu-meet/typings';
import '../../../src/config/dependency-injector.config.js';
import { MEET_ENV } from '../../../src/environment.js';
import { errorApiKeyNotConfigured } from '../../../src/models/error.model.js';
import { ApiKeyService } from '../../../src/services/api-key.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

class FakeApiKeyRepository {
	keys: MeetApiKey[] = [];
	failReads = false;

	async findAll(): Promise<MeetApiKey[]> {
		if (this.failReads) throw new Error('MongoDB unreachable');

		return [...this.keys];
	}

	async create(key: MeetApiKey): Promise<MeetApiKey> {
		this.keys.push(key);
		return key;
	}

	async deleteAll(): Promise<void> {
		this.keys = [];
	}
}

const build = ({ lockFree = true } = {}) => {
	const repository = new FakeApiKeyRepository();
	const locks: string[] = [];
	const mutex = {
		withRetryLock: async <T>(key: string, _ttl: number, callback: () => Promise<T>) => {
			locks.push(key);
			return lockFree ? callback() : null;
		}
	};
	const service = new ApiKeyService(
		...([noopLogger, {}, repository, mutex] as unknown as ConstructorParameters<typeof ApiKeyService>)
	);
	return { service, repository, locks };
};

describe('ApiKeyService', () => {
	const originalInitialKey = MEET_ENV.INITIAL_API_KEY;

	afterEach(() => {
		MEET_ENV.INITIAL_API_KEY = originalInitialKey;
	});

	it('seeds the configured initial API key once, under the API key lock', async () => {
		MEET_ENV.INITIAL_API_KEY = 'initial-key';
		const { service, repository, locks } = build();

		await service.initializeApiKey();
		await service.initializeApiKey();

		expect(repository.keys.map(({ key }) => key)).toEqual(['initial-key']);
		expect(locks).toEqual(['ov_meet_lock:api_key', 'ov_meet_lock:api_key']);
	});

	it('seeds nothing when no initial API key is configured', async () => {
		MEET_ENV.INITIAL_API_KEY = '';
		const { service, repository, locks } = build();

		await service.initializeApiKey();

		expect(repository.keys).toEqual([]);
		expect(locks).toEqual([]);
	});

	it('aborts the start when another replica keeps the API key lock', async () => {
		MEET_ENV.INITIAL_API_KEY = 'initial-key';
		const { service, repository } = build({ lockFree: false });

		await expect(service.initializeApiKey()).rejects.toThrow(
			"Could not acquire the API key lock 'ov_meet_lock:api_key'"
		);
		expect(repository.keys).toEqual([]);
	});

	it('replaces the API key with a new random one', async () => {
		const { service, repository } = build();
		repository.keys = [{ key: 'old-key', creationDate: 1 }];

		const created = await service.createApiKey();

		expect(created.key).toMatch(/^ovmeet-[0-9a-z]{32}$/);
		expect(repository.keys).toEqual([created]);
	});

	it('answers 409 to a new API key while another change holds the lock', async () => {
		const { service, repository } = build({ lockFree: false });
		repository.keys = [{ key: 'old-key', creationDate: 1 }];

		await expect(service.createApiKey()).rejects.toMatchObject({ statusCode: 409 });
		expect(repository.keys.map(({ key }) => key)).toEqual(['old-key']);
	});

	it('accepts only the stored API key', async () => {
		const { service, repository } = build();
		repository.keys = [{ key: 'the-key', creationDate: 1 }];

		expect(await service.validateApiKey('the-key')).toBe(true);
		expect(await service.validateApiKey('the-key ')).toBe(false);
		expect(await service.validateApiKey('')).toBe(false);
	});

	it('reports API keys as not configured when there are none', async () => {
		const { service } = build();

		await expect(service.validateApiKey('any')).rejects.toEqual(errorApiKeyNotConfigured());
	});

	it('passes on a failure to read the stored API keys, instead of reporting them as not configured', async () => {
		const { service, repository } = build();
		repository.keys = [{ key: 'the-key', creationDate: 1 }];
		repository.failReads = true;

		await expect(service.validateApiKey('the-key')).rejects.toThrow('MongoDB unreachable');
	});
});
