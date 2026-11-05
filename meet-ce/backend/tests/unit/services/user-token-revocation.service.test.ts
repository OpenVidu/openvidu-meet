import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MEET_ENV } from '../../../src/environment.js';
import { RedisKeyName } from '../../../src/models/redis.model.js';
import type { RedisService } from '../../../src/services/redis.service.js';
import { UserTokenRevocationService } from '../../../src/services/user-token-revocation.service.js';

const USER_ID = 'alice';

describe('UserTokenRevocationService', () => {
	const store = new Map<string, string>();
	const ttls = new Map<string, number>();
	const getMany = jest.fn(async (keys: string[]) => keys.map((key) => store.get(key) ?? null));
	const service = new UserTokenRevocationService({
		set: async (key: string, value: unknown, ttl: number) => {
			store.set(key, String(value));
			ttls.set(key, ttl);
		},
		setIfNotExists: async (key: string, value: string, ttl: number) => {
			if (store.has(key)) return false;

			store.set(key, value);
			ttls.set(key, ttl);
			return true;
		},
		getMany
	} as unknown as RedisService);

	const clockAt = (now: number) => jest.spyOn(Date, 'now').mockReturnValue(now);

	afterEach(() => {
		store.clear();
		ttls.clear();
		getMany.mockClear();
		jest.restoreAllMocks();
	});

	it('accepts a token when nothing was revoked', async () => {
		expect(await service.isRevoked(USER_ID, { iat: 1_000, sid: 'session-1' })).toBe(false);
	});

	it('revokes the tokens issued before the revocation and accepts the ones issued after', async () => {
		clockAt(10_000);
		await service.revokeIssuedTokens(USER_ID);

		expect(await service.isRevoked(USER_ID, { iat: 9_999 })).toBe(true);
		expect(await service.isRevoked(USER_ID, { iat: 10_000 })).toBe(false);
		expect(await service.isRevoked('bob', { iat: 9_999 })).toBe(false);
	});

	it('revokes every token of a revoked session, whenever it was issued', async () => {
		clockAt(10_000);
		await service.revokeSession('session-1');

		expect(await service.isRevoked(USER_ID, { iat: 20_000, sid: 'session-1' })).toBe(true);
		expect(await service.isRevoked(USER_ID, { iat: 20_000, sid: 'session-2' })).toBe(false);
	});

	it('only looks up a session mark for a token that carries a session', async () => {
		await service.isRevoked(USER_ID, { iat: 1_000 });

		expect(getMany).toHaveBeenCalledWith([`${RedisKeyName.USER_TOKENS_REVOKED_AT}${USER_ID}`]);
	});

	it('claims a refresh token exactly once', async () => {
		expect(await service.claimRefreshToken('rid-1')).toBe(true);
		expect(await service.claimRefreshToken('rid-1')).toBe(false);
		expect(await service.claimRefreshToken('rid-2')).toBe(true);
	});

	it('keeps every mark as long as the longest-lived token it could reject', async () => {
		const original = { ...MEET_ENV };
		MEET_ENV.ACCESS_TOKEN_EXPIRATION = '1h';
		MEET_ENV.REFRESH_TOKEN_EXPIRATION = '3h';
		MEET_ENV.PASSWORD_CHANGE_TOKEN_EXPIRATION = '2h';

		try {
			await service.revokeSession('session-1');
			await service.revokeIssuedTokens(USER_ID);
			await service.claimRefreshToken('rid-1');

			expect([...ttls.values()]).toEqual([3 * 3_600_000, 3 * 3_600_000, 3 * 3_600_000]);
		} finally {
			Object.assign(MEET_ENV, original);
		}
	});
});
