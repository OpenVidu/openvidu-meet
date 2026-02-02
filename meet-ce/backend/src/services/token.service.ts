import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { LiveKitPermissions, MeetRoomMemberTokenMetadata, MeetUser } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { jwtDecode } from 'jwt-decode';
import { AccessToken, AccessTokenOptions, ClaimGrants, TokenVerifier, VideoGrant } from 'livekit-server-sdk';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { validateTokenMetadata } from '../middlewares/request-validators/auth-validator.middleware.js';
import { validateRoomMemberTokenMetadata } from '../middlewares/request-validators/room-member-validator.middleware.js';
import { TokenMetadata, TokenType } from '../models/token-metadata.model.js';
import { LoggerService } from './logger.service.js';

@injectable()
export class TokenService {
	constructor(@inject(LoggerService) protected logger: LoggerService) {}

	async generateAccessToken(user: MeetUser, isTemporary = false): Promise<string> {
		const tokenMetadata: TokenMetadata = {
			iat: Date.now(),
			tokenType: isTemporary ? TokenType.TEMPORARY : TokenType.ACCESS
		};
		const tokenOptions: AccessTokenOptions = {
			identity: user.userId,
			name: user.name,
			ttl: isTemporary
				? INTERNAL_CONFIG.PASSWORD_CHANGE_TOKEN_EXPIRATION
				: INTERNAL_CONFIG.ACCESS_TOKEN_EXPIRATION,
			metadata: JSON.stringify(tokenMetadata)
		};
		return await this.generateJwtToken(tokenOptions);
	}

	parseTokenMetadata(metadata: string): TokenMetadata {
		try {
			const parsedMetadata = JSON.parse(metadata);
			return validateTokenMetadata(parsedMetadata);
		} catch (error) {
			this.logger.error('Failed to parse token metadata:', error);
			throw new Error('Invalid token metadata format');
		}
	}

	async generateRefreshToken(user: MeetUser): Promise<string> {
		const tokenMetadata: TokenMetadata = {
			iat: Date.now(),
			tokenType: TokenType.REFRESH
		};
		const tokenOptions: AccessTokenOptions = {
			identity: user.userId,
			name: user.name,
			ttl: INTERNAL_CONFIG.REFRESH_TOKEN_EXPIRATION,
			metadata: JSON.stringify(tokenMetadata)
		};
		return await this.generateJwtToken(tokenOptions);
	}

	async generateRoomMemberToken(
		tokenMetadata: MeetRoomMemberTokenMetadata,
		livekitPermissions?: LiveKitPermissions,
		participantName?: string,
		participantIdentity?: string
	): Promise<string> {
		const tokenOptions: AccessTokenOptions = {
			identity: participantIdentity,
			name: participantName,
			ttl: INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_EXPIRATION,
			metadata: JSON.stringify(tokenMetadata)
		};
		return await this.generateJwtToken(tokenOptions, livekitPermissions);
	}

	parseRoomMemberTokenMetadata(metadata: string): MeetRoomMemberTokenMetadata {
		try {
			const parsedMetadata = JSON.parse(metadata);
			return validateRoomMemberTokenMetadata(parsedMetadata);
		} catch (error) {
			this.logger.error('Failed to parse room member token metadata:', error);
			throw new Error('Invalid room member token metadata format');
		}
	}

	private async generateJwtToken(tokenOptions: AccessTokenOptions, grants?: VideoGrant): Promise<string> {
		const at = new AccessToken(MEET_ENV.LIVEKIT_API_KEY, MEET_ENV.LIVEKIT_API_SECRET, tokenOptions);

		if (grants) {
			at.addGrant(grants);
		}

		if (MEET_ENV.AGENT_SPEECH_PROCESSING_NAME) {
			this.logger.debug(
				'Adding speech processing agent dispatch to token',
				MEET_ENV.AGENT_SPEECH_PROCESSING_NAME
			);
			at.roomConfig = new RoomConfiguration({
				agents: [
					new RoomAgentDispatch({
						agentName: MEET_ENV.AGENT_SPEECH_PROCESSING_NAME
					})
				]
			});
		}

		return await at.toJwt();
	}

	async verifyToken(token: string): Promise<ClaimGrants> {
		const verifier = new TokenVerifier(MEET_ENV.LIVEKIT_API_KEY, MEET_ENV.LIVEKIT_API_SECRET);
		return await verifier.verify(token, 0);
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
