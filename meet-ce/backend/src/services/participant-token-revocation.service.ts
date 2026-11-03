import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { RedisKeyName } from '../models/redis.model.js';
import { RedisService } from './redis.service.js';

/**
 * Revokes the room member tokens a meeting participant was issued before they were demoted from
 * moderator, shared across replicas via Redis. A participant has no database record to stamp when they joined
 * anonymously, so the revocation is keyed by their LiveKit identity and lasts as long as a token does.
 */
@injectable()
export class ParticipantTokenRevocationService {
	constructor(@inject(RedisService) protected redisService: RedisService) {}

	/**
	 * Revokes every token issued so far, stamping the revocation ahead of this replica's clock by the clock
	 * tolerance so a token another replica issued just before, from a clock slightly ahead, is revoked too.
	 */
	async revokeIssuedTokens(roomId: string, participantIdentity: string): Promise<void> {
		const tokenLifetimeMs = ms(MEET_ENV.ROOM_MEMBER_TOKEN_EXPIRATION);
		const revokedAt = Date.now() + INTERNAL_CONFIG.REFRESH_CLOCK_TOLERANCE_SECONDS * 1000;
		await this.redisService.set(this.getKey(roomId, participantIdentity), revokedAt, tokenLifetimeMs);
	}

	/**
	 * The time to stamp on a token issued for the participant: never before the revocation recorded for them, so
	 * a replica whose clock is behind cannot issue a token that revocation refuses.
	 */
	async getIssueTime(roomId: string, participantIdentity: string): Promise<number> {
		const revokedAt = await this.redisService.get(this.getKey(roomId, participantIdentity));
		return Math.max(Date.now(), revokedAt === null ? 0 : Number(revokedAt) + 1);
	}

	async isRevoked(roomId: string, participantIdentity: string, issuedAt: number): Promise<boolean> {
		const revokedAt = await this.redisService.get(this.getKey(roomId, participantIdentity));
		return revokedAt !== null && issuedAt < Number(revokedAt);
	}

	protected getKey(roomId: string, participantIdentity: string): string {
		return `${RedisKeyName.PARTICIPANT_TOKENS_REVOKED_AT}${roomId}:${participantIdentity}`;
	}
}
