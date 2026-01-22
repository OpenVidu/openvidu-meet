import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
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
import { MEET_ENV } from '../environment.js';
import { LoggerService } from './logger.service.js';

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
		participantIdentity?: string,
		roomWithCaptions = false
	): Promise<string> {
		const metadata: MeetRoomMemberTokenMetadata = {
			livekitUrl: MEET_ENV.LIVEKIT_URL,
			role,
			permissions: permissions.meet
		};

		const tokenOptions: AccessTokenOptions = {
			identity: participantIdentity,
			name: participantName,
			ttl: INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_EXPIRATION,
			metadata: JSON.stringify(metadata)
		};
		return await this.generateJwtToken(tokenOptions, permissions.livekit as VideoGrant, roomWithCaptions);
	}

	private async generateJwtToken(
		tokenOptions: AccessTokenOptions,
		grants?: VideoGrant,
		roomWithCaptions = false
	): Promise<string> {
		const at = new AccessToken(MEET_ENV.LIVEKIT_API_KEY, MEET_ENV.LIVEKIT_API_SECRET, tokenOptions);

		if (grants) {
			at.addGrant(grants);
		}

		const captionsEnabledInEnv = MEET_ENV.CAPTIONS_ENABLED === 'true';
		const captionsEnabledInRoom = Boolean(roomWithCaptions);

		// Warn if configuration is inconsistent
		if (!captionsEnabledInEnv && captionsEnabledInRoom) {
			this.logger.warn(
				`Captions feature is disabled in environment but Room is created with captions enabled. Please enable captions in environment by setting MEET_CAPTIONS_ENABLED=true to ensure proper functionality.`
			);
		}

		if (captionsEnabledInEnv && captionsEnabledInRoom) {
			this.logger.debug('Activating Captions Agent. Configuring Room Agent Dispatch.');
			at.roomConfig = new RoomConfiguration({
				agents: [
					new RoomAgentDispatch({
						agentName: INTERNAL_CONFIG.CAPTIONS_AGENT_NAME
					})
				]
			});
		}

		return await at.toJwt();
	}

	async verifyToken(token: string): Promise<ClaimGrants> {
		const verifyer = new TokenVerifier(MEET_ENV.LIVEKIT_API_KEY, MEET_ENV.LIVEKIT_API_SECRET);
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
