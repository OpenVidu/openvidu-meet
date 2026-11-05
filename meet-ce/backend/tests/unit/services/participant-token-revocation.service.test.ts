import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ParticipantTokenRevocationService } from '../../../src/services/participant-token-revocation.service.js';
import type { RedisService } from '../../../src/services/redis.service.js';

const ROOM_ID = 'room-1';
const IDENTITY = 'participant-1';

// Replicas stamp revocations and issue tokens from their own clocks, which may disagree.
describe('ParticipantTokenRevocationService', () => {
	const store = new Map<string, string>();
	const service = new ParticipantTokenRevocationService({
		set: async (key: string, value: unknown) => store.set(key, String(value)),
		get: async (key: string) => store.get(key) ?? null
	} as unknown as RedisService);

	const clockAt = (now: number) => jest.spyOn(Date, 'now').mockReturnValue(now);

	afterEach(() => {
		store.clear();
		jest.restoreAllMocks();
	});

	it('revokes a token issued before, even by a replica whose clock is ahead of the revocation', async () => {
		clockAt(20_000);
		const earlierToken = await service.getTokenIssue(ROOM_ID, IDENTITY);

		clockAt(10_000);
		await service.revokeIssuedTokens(ROOM_ID, IDENTITY);

		expect(await service.isRevoked(ROOM_ID, IDENTITY, earlierToken)).toBe(true);
	});

	it('accepts a token issued after, even by a replica whose clock is behind the revocation', async () => {
		clockAt(10_000);
		await service.revokeIssuedTokens(ROOM_ID, IDENTITY);

		clockAt(9_000);
		const laterToken = await service.getTokenIssue(ROOM_ID, IDENTITY);

		expect(await service.isRevoked(ROOM_ID, IDENTITY, laterToken)).toBe(false);
	});

	// A token stamped ahead of the replica's clock would outlive a permission update made right after it.
	it('stamps a token with the time of the replica that issues it, revocation or not', async () => {
		clockAt(10_000);
		expect((await service.getTokenIssue(ROOM_ID, IDENTITY)).iat).toBe(10_000);

		await service.revokeIssuedTokens(ROOM_ID, IDENTITY);
		expect((await service.getTokenIssue(ROOM_ID, IDENTITY)).iat).toBe(10_000);
	});

	it('revokes a token issued after one demotion when a later demotion comes', async () => {
		clockAt(10_000);
		await service.revokeIssuedTokens(ROOM_ID, IDENTITY);
		const tokenBetweenDemotions = await service.getTokenIssue(ROOM_ID, IDENTITY);

		clockAt(20_000);
		await service.revokeIssuedTokens(ROOM_ID, IDENTITY);

		expect(await service.isRevoked(ROOM_ID, IDENTITY, tokenBetweenDemotions)).toBe(true);
	});
});
