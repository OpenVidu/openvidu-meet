import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Redis } from 'ioredis';
import ms from 'ms';
import { container, registerDependencies } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { ParticipantNameService } from '../../../../src/services/participant-name.service.js';
import { RedisService } from '../../../../src/services/redis.service.js';

describe('ParticipantNameService', () => {
	const roomId = 'test-room-name-ttl';
	const reservationTtl = ms(INTERNAL_CONFIG.PARTICIPANT_NAME_RESERVATION_TTL);
	let participantNameService: ParticipantNameService;
	let redisService: RedisService;
	let redis: Redis;

	const remainingTtl = async (pattern: string): Promise<number> => {
		const keys = await redisService.getKeys(pattern);
		expect(keys).toHaveLength(1);
		return redis.pttl(keys[0]);
	};

	beforeAll(() => {
		registerDependencies();
		participantNameService = container.get(ParticipantNameService);
		redisService = container.get(RedisService);
		redis = new Redis({
			host: MEET_ENV.REDIS_HOST,
			port: Number(MEET_ENV.REDIS_PORT),
			username: MEET_ENV.REDIS_USERNAME,
			password: MEET_ENV.REDIS_PASSWORD,
			db: Number(MEET_ENV.REDIS_DB)
		});
	});

	afterAll(async () => {
		const keys = await redisService.getKeys(`ov_meet:*:${roomId}:*`);

		if (keys.length > 0) {
			await redisService.delete(keys);
		}

		await redis.quit();
	});

	describe('Reservation time to live', () => {
		it('keeps a reserved name for the configured time, not for 1000 times longer', async () => {
			await participantNameService.reserveUniqueName(roomId, 'Expiring');

			const ttl = await remainingTtl(`ov_meet:room_participants:${roomId}:expiring`);

			expect(ttl).toBeGreaterThan(reservationTtl - ms('1m'));
			expect(ttl).toBeLessThanOrEqual(reservationTtl);
		});

		it('keeps a released numeric suffix for the same time as a reservation', async () => {
			await participantNameService.reserveUniqueName(roomId, 'Numbered');
			const numberedName = await participantNameService.reserveUniqueName(roomId, 'Numbered');
			await participantNameService.releaseName(roomId, numberedName);

			const ttl = await remainingTtl(`ov_meet:participant_pool:${roomId}:*`);

			expect(ttl).toBeGreaterThan(reservationTtl - ms('1m'));
			expect(ttl).toBeLessThanOrEqual(reservationTtl);
		});
	});
});
