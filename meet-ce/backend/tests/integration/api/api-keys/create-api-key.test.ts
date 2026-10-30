import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import ms from 'ms';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG, setInternalConfig } from '../../../../src/config/internal-config.js';
import { MeetLock } from '../../../../src/helpers/redis.helper.js';
import { MutexService } from '../../../../src/services/mutex.service.js';
import {
	generateApiKey,
	getApiKeys,
	getFullPath,
	loginRootAdmin,
	restoreDefaultApiKeys,
	startTestServer
} from '../../../helpers/request-helpers.js';

const API_KEYS_PATH = getFullPath(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/api-keys`);

describe('API Keys API Tests', () => {
	let app: Express;
	let rootAdminAccessToken: string;

	beforeAll(async () => {
		app = await startTestServer();
		({ accessToken: rootAdminAccessToken } = await loginRootAdmin());
	});

	afterAll(async () => {
		await restoreDefaultApiKeys();
	});

	const getRoomsWithApiKey = async (apiKey: string) => {
		return request(app)
			.get(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`))
			.set(INTERNAL_CONFIG.API_KEY_HEADER, apiKey);
	};

	describe('Create API Key', () => {
		it('should create a new API key', async () => {
			const response = await request(app)
				.post(`${API_KEYS_PATH}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, rootAdminAccessToken)
				.expect(201);

			expect(response.body).toHaveProperty('key');
			expect(response.body).toHaveProperty('creationDate');
			expect(response.body.key).toMatch(/^ovmeet-/);

			// Verify the API key works by making a request to the get rooms endpoint
			// using the newly created API key
			const apiResponse = await getRoomsWithApiKey(response.body.key);
			expect(apiResponse.status).toBe(200);
		});

		it('should only exist one API key at a time', async () => {
			const apiKey1 = await generateApiKey();
			const apiKey2 = await generateApiKey();
			const response = await getApiKeys();

			expect(response.body.length).toBe(1);
			expect(response.body[0].key).toBe(apiKey2); // The second key should replace the first

			// Verify the first API key no longer works
			let apiResponse = await getRoomsWithApiKey(apiKey1);
			expect(apiResponse.status).toBe(401);

			// Verify the second API key works
			apiResponse = await getRoomsWithApiKey(apiKey2);
			expect(apiResponse.status).toBe(200);
		});

		it('should leave exactly one API key, the last one generated, after two simultaneous regenerations', async () => {
			const createApiKey = () =>
				request(app).post(API_KEYS_PATH).set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, rootAdminAccessToken);
			const responses = await Promise.all([createApiKey(), createApiKey()]);

			expect(responses.map((response) => response.status)).toEqual([201, 201]);
			const generatedKeys: string[] = responses.map((response) => response.body.key);

			const { body: storedKeys } = await getApiKeys();
			expect(storedKeys).toHaveLength(1);
			expect(generatedKeys).toContain(storedKeys[0].key);

			const discardedKey = generatedKeys.find((key) => key !== storedKeys[0].key)!;
			expect((await getRoomsWithApiKey(storedKeys[0].key)).status).toBe(200);
			expect((await getRoomsWithApiKey(discardedKey)).status).toBe(401);
		});

		it('should answer 409 when another API key change keeps the lock past the wait budget', async () => {
			const { API_KEY_LOCK_MAX_ATTEMPTS } = INTERNAL_CONFIG;
			setInternalConfig({ API_KEY_LOCK_MAX_ATTEMPTS: 1 });

			try {
				const response = await container
					.get(MutexService)
					.withLock(MeetLock.getApiKeyLock(), ms('5s'), () =>
						request(app).post(API_KEYS_PATH).set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, rootAdminAccessToken)
					);

				expect(response?.status).toBe(409);
				expect(response?.body.message).toBe('Another API key change is in progress, please retry');
			} finally {
				setInternalConfig({ API_KEY_LOCK_MAX_ATTEMPTS });
			}
		});
	});
});
