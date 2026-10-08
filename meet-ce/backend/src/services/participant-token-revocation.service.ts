import { inject, injectable } from 'inversify';
import ms from 'ms';
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

	async revokeIssuedTokens(roomId: string, participantIdentity: string): Promise<void> {
		const tokenLifetimeMs = ms(MEET_ENV.ROOM_MEMBER_TOKEN_EXPIRATION);
		await this.redisService.set(this.getKey(roomId, participantIdentity), Date.now(), tokenLifetimeMs);
	}

	async isRevoked(roomId: string, participantIdentity: string, issuedAt: number): Promise<boolean> {
		const revokedAt = await this.redisService.get(this.getKey(roomId, participantIdentity));
		return revokedAt !== null && issuedAt < Number(revokedAt);
	}

	protected getKey(roomId: string, participantIdentity: string): string {
		return `${RedisKeyName.PARTICIPANT_TOKENS_REVOKED_AT}${roomId}:${participantIdentity}`;
	}
}
