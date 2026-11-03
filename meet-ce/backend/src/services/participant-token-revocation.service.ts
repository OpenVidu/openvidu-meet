import type { MeetRoomMemberTokenMetadata } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { MEET_ENV } from '../environment.js';
import { RedisKeyName } from '../models/redis.model.js';
import { RedisService } from './redis.service.js';

type TokenIssue = Pick<MeetRoomMemberTokenMetadata, 'iat' | 'issuedAfterRevocation'>;

/**
 * Revokes the room member tokens a meeting participant was issued before they were demoted from
 * moderator, shared across replicas via Redis. A participant has no database record to stamp when they joined
 * anonymously, so the revocation is keyed by their LiveKit identity and lasts as long as a token does.
 *
 * A token carries the revocation recorded when it was issued, so telling an earlier token from a later one never
 * compares the clocks of two replicas.
 */
@injectable()
export class ParticipantTokenRevocationService {
	constructor(@inject(RedisService) protected redisService: RedisService) {}

	async revokeIssuedTokens(roomId: string, participantIdentity: string): Promise<void> {
		const tokenLifetimeMs = ms(MEET_ENV.ROOM_MEMBER_TOKEN_EXPIRATION);
		await this.redisService.set(this.getKey(roomId, participantIdentity), Date.now(), tokenLifetimeMs);
	}

	async getTokenIssue(roomId: string, participantIdentity: string): Promise<TokenIssue> {
		return { iat: Date.now(), issuedAfterRevocation: await this.getRevocation(roomId, participantIdentity) };
	}

	async isRevoked(
		roomId: string,
		participantIdentity: string,
		{ issuedAfterRevocation }: Pick<TokenIssue, 'issuedAfterRevocation'>
	): Promise<boolean> {
		const revocation = await this.getRevocation(roomId, participantIdentity);
		return revocation !== undefined && revocation !== issuedAfterRevocation;
	}

	protected async getRevocation(roomId: string, participantIdentity: string): Promise<number | undefined> {
		const revokedAt = await this.redisService.get(this.getKey(roomId, participantIdentity));
		return revokedAt === null ? undefined : Number(revokedAt);
	}

	protected getKey(roomId: string, participantIdentity: string): string {
		return `${RedisKeyName.PARTICIPANT_TOKENS_REVOKED_AT}${roomId}:${participantIdentity}`;
	}
}
