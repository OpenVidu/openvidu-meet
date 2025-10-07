import {
	LiveKitPermissions,
	MeetTokenMetadata,
	OpenViduMeetPermissions,
	ParticipantOptions,
	ParticipantRole,
	RecordingPermissions,
	User
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { jwtDecode } from 'jwt-decode';
import { AccessToken, AccessTokenOptions, ClaimGrants, TokenVerifier, VideoGrant } from 'livekit-server-sdk';
import INTERNAL_CONFIG from '../config/internal-config.js';
import { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } from '../environment.js';
import { LoggerService } from './index.js';

@injectable()
export class TokenService {
	constructor(@inject(LoggerService) protected logger: LoggerService) {}

	async generateAccessToken(user: User): Promise<string> {
		const tokenOptions: AccessTokenOptions = {
			identity: user.username,
			ttl: INTERNAL_CONFIG.ACCESS_TOKEN_EXPIRATION,
			metadata: JSON.stringify({
				roles: user.roles
			})
		};
		return await this.generateJwtToken(tokenOptions);
	}

	async generateRefreshToken(user: User): Promise<string> {
		const tokenOptions: AccessTokenOptions = {
			identity: user.username,
			ttl: INTERNAL_CONFIG.REFRESH_TOKEN_EXPIRATION,
			metadata: JSON.stringify({
				roles: user.roles
			})
		};
		return await this.generateJwtToken(tokenOptions);
	}

	async generateParticipantToken(
		participantOptions: ParticipantOptions,
		lkPermissions: LiveKitPermissions,
		roles: { role: ParticipantRole; permissions: OpenViduMeetPermissions }[],
		selectedRole: ParticipantRole
	): Promise<string> {
		const { roomId, participantName } = participantOptions;
		this.logger.info(
			`Generating token for room '${roomId}'` + (participantName ? ` and participant '${participantName}'` : '')
		);

		let { participantIdentity } = participantOptions;

		if (participantName && !participantIdentity) {
			participantIdentity = participantName;
		}

		const metadata: MeetTokenMetadata = {
			livekitUrl: LIVEKIT_URL,
			roles,
			selectedRole
		};
		const tokenOptions: AccessTokenOptions = {
			identity: participantIdentity,
			name: participantName,
			ttl: INTERNAL_CONFIG.PARTICIPANT_TOKEN_EXPIRATION,
			metadata: JSON.stringify(metadata)
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
			ttl: INTERNAL_CONFIG.RECORDING_TOKEN_EXPIRATION,
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
