import {
	MEET_ACCESS_TOKEN_EXPIRATION,
	MEET_REFRESH_TOKEN_EXPIRATION,
	LIVEKIT_API_KEY,
	LIVEKIT_API_SECRET
} from '../environment.js';
import { injectable } from '../config/dependency-injector.config.js';
import { AccessToken, AccessTokenOptions, ClaimGrants, TokenVerifier } from 'livekit-server-sdk';

@injectable()
export class TokenService {
	async generateAccessToken(username: string): Promise<string> {
		return await this.generateJwtToken(username, MEET_ACCESS_TOKEN_EXPIRATION);
	}

	async generateRefreshToken(username: string): Promise<string> {
		return await this.generateJwtToken(username, MEET_REFRESH_TOKEN_EXPIRATION);
	}

	private async generateJwtToken(username: string, expiration: string): Promise<string> {
		const options: AccessTokenOptions = {
			identity: username,
			ttl: expiration,
			metadata: JSON.stringify({
				role: 'admin'
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
