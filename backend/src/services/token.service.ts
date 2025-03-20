import {
	MEET_ACCESS_TOKEN_EXPIRATION,
	MEET_REFRESH_TOKEN_EXPIRATION,
	LIVEKIT_API_KEY,
	LIVEKIT_API_SECRET
} from '../environment.js';
import { injectable } from '../config/dependency-injector.config.js';
import { AccessToken, AccessTokenOptions, ClaimGrants, TokenVerifier } from 'livekit-server-sdk';
import { User } from '@typings-ce';

@injectable()
export class TokenService {
	async generateAccessToken(user: User): Promise<string> {
		return await this.generateJwtToken(user, MEET_ACCESS_TOKEN_EXPIRATION);
	}

	async generateRefreshToken(user: User): Promise<string> {
		return await this.generateJwtToken(user, MEET_REFRESH_TOKEN_EXPIRATION);
	}

	private async generateJwtToken(user: User, expiration: string): Promise<string> {
		const options: AccessTokenOptions = {
			identity: user.username,
			ttl: expiration,
			metadata: JSON.stringify({
				role: user.role
			})
		};
		const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, options);
		return await at.toJwt();
	}

	async verifyToken(token: string): Promise<ClaimGrants> {
		const verifyer = new TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
		return await verifyer.verify(token);
	}
}
