import {
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetUser
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { jwtDecode } from 'jwt-decode';
import { AccessToken, AccessTokenOptions, ClaimGrants, TokenVerifier, VideoGrant } from 'livekit-server-sdk';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } from '../environment.js';
import { LoggerService } from './index.js';

@injectable()
export class TokenService {
	constructor(@inject(LoggerService) protected logger: LoggerService) {}

	async generateAccessToken(user: MeetUser): Promise<string> {
		const tokenOptions: AccessTokenOptions = {
			identity: user.username,
			ttl: INTERNAL_CONFIG.ACCESS_TOKEN_EXPIRATION,
			metadata: JSON.stringify({
				roles: user.roles
			})
		};
		return await this.generateJwtToken(tokenOptions);
	}

	async generateRefreshToken(user: MeetUser): Promise<string> {
		const tokenOptions: AccessTokenOptions = {
			identity: user.username,
			ttl: INTERNAL_CONFIG.REFRESH_TOKEN_EXPIRATION,
			metadata: JSON.stringify({
				roles: user.roles
			})
		};
		return await this.generateJwtToken(tokenOptions);
	}

	async generateRoomMemberToken(
		role: MeetRoomMemberRole,
		permissions: MeetRoomMemberPermissions,
		participantName?: string,
		participantIdentity?: string
	): Promise<string> {
		const metadata: MeetRoomMemberTokenMetadata = {
			livekitUrl: LIVEKIT_URL,
			role,
			permissions: permissions.meet
		};

		const tokenOptions: AccessTokenOptions = {
			identity: participantIdentity,
			name: participantName,
			ttl: INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_EXPIRATION,
			metadata: JSON.stringify(metadata)
		};
		return await this.generateJwtToken(tokenOptions, permissions.livekit as VideoGrant);
	}

	private async generateJwtToken(tokenOptions: AccessTokenOptions, grants?: VideoGrant): Promise<string> {
		const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, tokenOptions);

		if (grants) {
			at.addGrant(grants);
		}

		return await at.toJwt();
	}

	async verifyToken(token: string): Promise<ClaimGrants> {
		const verifyer = new TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
		return await verifyer.verify(token, 0);
	}

	/**
	 * Decodes a JWT and returns its ClaimGrants, even if expired.
	 */
	getClaimsIgnoringExpiration(token: string): ClaimGrants {
		try {
			const decoded = jwtDecode<ClaimGrants>(token);
			return decoded;
		} catch (error) {
			this.logger.error('Failed to decode JWT:', error);
			throw error;
		}
	}
}
