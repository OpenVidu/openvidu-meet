import { afterEach, describe, expect, it, jest } from '@jest/globals';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { ParticipantTokenRevocationService } from '../../../src/services/participant-token-revocation.service.js';
import type { RedisService } from '../../../src/services/redis.service.js';

const ROOM_ID = 'room-1';
const IDENTITY = 'participant-1';
const CLOCK_MARGIN_MS = INTERNAL_CONFIG.REFRESH_CLOCK_TOLERANCE_SECONDS * 1000;

// Replicas stamp revocations and issue tokens from their own clocks.
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

	it('revokes a token another replica issued just before, from a clock slightly ahead', async () => {
		clockAt(10_000);
		await service.revokeIssuedTokens(ROOM_ID, IDENTITY);

		expect(await service.isRevoked(ROOM_ID, IDENTITY, 10_000 + CLOCK_MARGIN_MS - 1)).toBe(true);
	});

	it('issues a token at the time of the replica when nothing was revoked, or the revocation is behind it', async () => {
		clockAt(10_000);
		expect(await service.getIssueTime(ROOM_ID, IDENTITY)).toBe(10_000);

		await service.revokeIssuedTokens(ROOM_ID, IDENTITY);
		clockAt(10_000 + CLOCK_MARGIN_MS + 5_000);
		expect(await service.getIssueTime(ROOM_ID, IDENTITY)).toBe(10_000 + CLOCK_MARGIN_MS + 5_000);
	});

	it('issues a token the revocation accepts even from a replica whose clock is behind it', async () => {
		clockAt(10_000);
		await service.revokeIssuedTokens(ROOM_ID, IDENTITY);

		clockAt(9_000);
		const issuedAt = await service.getIssueTime(ROOM_ID, IDENTITY);

		expect(await service.isRevoked(ROOM_ID, IDENTITY, issuedAt)).toBe(false);
		expect(issuedAt).toBeGreaterThan(10_000 + CLOCK_MARGIN_MS);
	});
});
