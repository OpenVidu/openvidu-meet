import {
	LiveKitPermissions,
	OpenViduMeetPermissions,
	ParticipantOptions,
	ParticipantRole,
	RecordingPermissions,
	User
} from '@typings-ce';
import { inject, injectable } from 'inversify';
import { AccessToken, AccessTokenOptions, ClaimGrants, TokenVerifier, VideoGrant } from 'livekit-server-sdk';
import {
	LIVEKIT_API_KEY,
	LIVEKIT_API_SECRET,
	LIVEKIT_URL,
	MEET_ACCESS_TOKEN_EXPIRATION,
	MEET_PARTICIPANT_TOKEN_EXPIRATION,
	MEET_RECORDING_TOKEN_EXPIRATION,
	MEET_REFRESH_TOKEN_EXPIRATION
} from '../environment.js';
import { LoggerService } from './index.js';
import { jwtDecode } from 'jwt-decode';

@injectable()
export class TokenService {
	constructor(@inject(LoggerService) protected logger: LoggerService) {}

	async generateAccessToken(user: User): Promise<string> {
		const tokenOptions: AccessTokenOptions = {
			identity: user.username,
			ttl: MEET_ACCESS_TOKEN_EXPIRATION,
			metadata: JSON.stringify({
				roles: user.roles
			})
		};
		return await this.generateJwtToken(tokenOptions);
	}

	async generateRefreshToken(user: User): Promise<string> {
		const tokenOptions: AccessTokenOptions = {
			identity: user.username,
			ttl: MEET_REFRESH_TOKEN_EXPIRATION,
			metadata: JSON.stringify({
				roles: user.roles
			})
		};
		return await this.generateJwtToken(tokenOptions);
	}

	async generateParticipantToken(
		participantOptions: ParticipantOptions,
		lkPermissions: LiveKitPermissions,
		roles: { role: ParticipantRole; permissions: OpenViduMeetPermissions }[]
	): Promise<string> {
		const { roomId, participantName } = participantOptions;
		this.logger.info(`Generating token for ${participantName} in room ${roomId}`);

		const tokenOptions: AccessTokenOptions = {
			identity: participantName,
			name: participantName,
			ttl: MEET_PARTICIPANT_TOKEN_EXPIRATION,
			metadata: JSON.stringify({
				livekitUrl: LIVEKIT_URL,
				roles
			})
		};
		return await this.generateJwtToken(tokenOptions, lkPermissions as VideoGrant);
	}

	async generateRecordingToken(
		roomId: string,
		role: ParticipantRole,
		permissions: RecordingPermissions
	): Promise<string> {
		this.logger.info(`Generating recording token for room ${roomId}`);
		const tokenOptions: AccessTokenOptions = {
			ttl: MEET_RECORDING_TOKEN_EXPIRATION,
			metadata: JSON.stringify({
				role,
				recordingPermissions: permissions
			})
		};
		const grants: VideoGrant = {
			room: roomId
		};
		return await this.generateJwtToken(tokenOptions, grants);
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
