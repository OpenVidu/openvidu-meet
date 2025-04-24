import {
	MEET_ACCESS_TOKEN_EXPIRATION,
	MEET_REFRESH_TOKEN_EXPIRATION,
	LIVEKIT_API_KEY,
	LIVEKIT_API_SECRET,
	MEET_PARTICIPANT_TOKEN_EXPIRATION,
	LIVEKIT_URL
} from '../environment.js';
import { inject, injectable } from '../config/dependency-injector.config.js';
import { AccessToken, AccessTokenOptions, ClaimGrants, TokenVerifier, VideoGrant } from 'livekit-server-sdk';
import { ParticipantPermissions, ParticipantRole, ParticipantOptions, User } from '@typings-ce';
import { LoggerService } from './index.js';

@injectable()
export class TokenService {
	constructor(@inject(LoggerService) protected logger: LoggerService) {}

	async generateAccessToken(user: User): Promise<string> {
		const tokenOptions: AccessTokenOptions = {
			identity: user.username,
			ttl: MEET_ACCESS_TOKEN_EXPIRATION,
			metadata: JSON.stringify({
				role: user.role
			})
		};
		return await this.generateJwtToken(tokenOptions);
	}

	async generateRefreshToken(user: User): Promise<string> {
		const tokenOptions: AccessTokenOptions = {
			identity: user.username,
			ttl: MEET_REFRESH_TOKEN_EXPIRATION,
			metadata: JSON.stringify({
				role: user.role
			})
		};
		return await this.generateJwtToken(tokenOptions);
	}

	async generateParticipantToken(
		participantOptions: ParticipantOptions,
		permissions: ParticipantPermissions,
		role: ParticipantRole
	): Promise<string> {
		const { roomId, participantName } = participantOptions;
		this.logger.info(`Generating token for ${participantName} in room ${roomId}`);

		const tokenOptions: AccessTokenOptions = {
			identity: participantName,
			name: participantName,
			ttl: MEET_PARTICIPANT_TOKEN_EXPIRATION,
			metadata: JSON.stringify({
				livekitUrl: LIVEKIT_URL,
				role,
				permissions: permissions.openvidu
			})
		};
		return await this.generateJwtToken(tokenOptions, permissions.livekit);
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
		return await verifyer.verify(token);
	}
}
