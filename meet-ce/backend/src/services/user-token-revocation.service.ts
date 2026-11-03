import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { errorRedisNotAvailable } from '../models/error.model.js';
import { RedisKeyName } from '../models/redis.model.js';
import type { TokenMetadata } from '../models/token.model.js';
import { RedisService } from './redis.service.js';

/**
 * Revokes user access, refresh and temporary tokens, shared across replicas via Redis. Every mark lasts as long as
 * the longest token lifetime, after which any token it could reject has expired anyway. Redis is waited for a
 * bounded time: when it cannot answer, the operation fails as unavailable instead of hanging the request.
 */
@injectable()
export class UserTokenRevocationService {
	constructor(@inject(RedisService) protected redisService: RedisService) {}

	async revokeSession(sid: string): Promise<void> {
		await this.withinBoundedWait(
			this.redisService.set(`${RedisKeyName.USER_SESSION_REVOKED}${sid}`, Date.now(), this.getMarkLifetimeMs())
		);
	}

	async revokeIssuedTokens(userId: string): Promise<void> {
		await this.withinBoundedWait(
			this.redisService.set(
				`${RedisKeyName.USER_TOKENS_REVOKED_AT}${userId}`,
				Date.now(),
				this.getMarkLifetimeMs()
			)
		);
	}

	/**
	 * Marks a refresh token as exchanged.
	 *
	 * @returns `false` when it had already been exchanged
	 */
	claimRefreshToken(rid: string): Promise<boolean> {
		return this.withinBoundedWait(
			this.redisService.setIfNotExists(
				`${RedisKeyName.REFRESH_TOKEN_USED}${rid}`,
				Date.now().toString(),
				this.getMarkLifetimeMs()
			)
		);
	}

	async isRevoked(userId: string, { iat, sid }: Pick<TokenMetadata, 'iat' | 'sid'>): Promise<boolean> {
		const keys = [`${RedisKeyName.USER_TOKENS_REVOKED_AT}${userId}`];

		if (sid) {
			keys.push(`${RedisKeyName.USER_SESSION_REVOKED}${sid}`);
		}

		const [revokedAt, sessionRevoked = null] = await this.withinBoundedWait(this.redisService.getMany(keys));
		return sessionRevoked !== null || (revokedAt !== null && iat < Number(revokedAt));
	}

	private async withinBoundedWait<T>(operation: Promise<T>): Promise<T> {
		let timer: NodeJS.Timeout | undefined;
		const expiry = new Promise<never>((_, reject) => {
			timer = setTimeout(reject, INTERNAL_CONFIG.USER_TOKEN_REVOCATION_TIMEOUT_MS);
		});

		try {
			return await Promise.race([operation, expiry]);
		} catch {
			throw errorRedisNotAvailable();
		} finally {
			clearTimeout(timer);
		}
	}

	protected getMarkLifetimeMs(): number {
		return Math.max(
			ms(MEET_ENV.ACCESS_TOKEN_EXPIRATION),
			ms(MEET_ENV.REFRESH_TOKEN_EXPIRATION),
			ms(MEET_ENV.PASSWORD_CHANGE_TOKEN_EXPIRATION)
		);
	}
}
