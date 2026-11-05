import type { MeetRoomMemberTokenMetadata, MeetUser } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { jwtDecode } from 'jwt-decode';
import type { AccessTokenOptions, ClaimGrants, VideoGrant } from 'livekit-server-sdk';
import { AccessToken, TokenVerifier } from 'livekit-server-sdk';
import { uid } from 'uid/secure';
import { MEET_ENV } from '../environment.js';
import { errorInvalidToken } from '../models/error.model.js';
import type { RequestRoomSnapshot } from '../models/request-context.model.js';
import { REQUEST_ROOM_FIELDS } from '../models/request-context.model.js';
import type { MeetRoomMemberTokenOptions, TokenMetadata } from '../models/token.model.js';
import { TokenType } from '../models/token.model.js';
import { TokenMetadataSchema } from '../models/zod-schemas/auth.schema.js';
import { RoomMemberTokenMetadataSchema } from '../models/zod-schemas/room-member.schema.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { LoggerService } from './logger.service.js';
import { ParticipantTokenRevocationService } from './participant-token-revocation.service.js';

@injectable()
export class TokenService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(RoomMemberRepository) protected roomMemberRepository: RoomMemberRepository,
		@inject(UserRepository) protected userRepository: UserRepository,
		@inject(ParticipantTokenRevocationService)
		protected participantTokenRevocationService: ParticipantTokenRevocationService
	) {}

	/**
	 * Starts a login session: a new session id for the tokens a login or a password change returns.
	 */
	createSessionId(): string {
		return uid(32);
	}

	async generateAccessToken(user: MeetUser, sid: string, isTemporary = false): Promise<string> {
		const tokenMetadata: TokenMetadata = {
			iat: Date.now(),
			tokenType: isTemporary ? TokenType.TEMPORARY : TokenType.ACCESS,
			sid
		};
		const tokenOptions: AccessTokenOptions = {
			identity: user.userId,
			name: user.name,
			ttl: isTemporary ? MEET_ENV.PASSWORD_CHANGE_TOKEN_EXPIRATION : MEET_ENV.ACCESS_TOKEN_EXPIRATION,
			metadata: JSON.stringify(tokenMetadata)
		};
		return await this.generateJwtToken(tokenOptions);
	}

	parseTokenMetadata(metadata: string): TokenMetadata {
		try {
			return TokenMetadataSchema.parse(JSON.parse(metadata));
		} catch (error) {
			this.logger.debug('Failed to parse token metadata:', error);
			throw new Error('Invalid token metadata format', { cause: error });
		}
	}

	async generateRefreshToken(user: MeetUser, sid: string): Promise<string> {
		const tokenMetadata: TokenMetadata = {
			iat: Date.now(),
			tokenType: TokenType.REFRESH,
			sid,
			rid: uid(32)
		};
		const tokenOptions: AccessTokenOptions = {
			identity: user.userId,
			name: user.name,
			ttl: MEET_ENV.REFRESH_TOKEN_EXPIRATION,
			metadata: JSON.stringify(tokenMetadata)
		};
		return await this.generateJwtToken(tokenOptions);
	}

	async generateRoomMemberToken(options: MeetRoomMemberTokenOptions): Promise<string> {
		const { tokenMetadata, livekitPermissions, participantName, participantIdentity } = options;

		const tokenOptions: AccessTokenOptions = {
			identity: participantIdentity,
			name: participantName,
			ttl: MEET_ENV.ROOM_MEMBER_TOKEN_EXPIRATION,
			metadata: JSON.stringify(tokenMetadata)
		};
		return await this.generateJwtToken(tokenOptions, livekitPermissions);
	}

	parseRoomMemberTokenMetadata(metadata: string): MeetRoomMemberTokenMetadata {
		try {
			return RoomMemberTokenMetadataSchema.parse(JSON.parse(metadata));
		} catch (error) {
			this.logger.debug('Failed to parse room member token metadata:', error);
			throw new Error('Invalid room member token metadata format', { cause: error });
		}
	}

	private async generateJwtToken(tokenOptions: AccessTokenOptions, grants?: VideoGrant): Promise<string> {
		const at = new AccessToken(MEET_ENV.LIVEKIT_API_KEY, MEET_ENV.LIVEKIT_API_SECRET, tokenOptions);

		if (grants) {
			at.addGrant(grants);
		}

		return await at.toJwt();
	}

	async verifyToken(token: string, clockToleranceSeconds = 0): Promise<ClaimGrants> {
		const verifier = new TokenVerifier(MEET_ENV.LIVEKIT_API_KEY, MEET_ENV.LIVEKIT_API_SECRET);
		return await verifier.verify(token, clockToleranceSeconds);
	}

	/**
	 * Verifies a room member token and that no later change invalidated it (see {@link checkRoomMemberTokenCurrency}).
	 *
	 * @param clockToleranceSeconds - How long after its expiry the token is still accepted
	 * @param ignoreDemotion - Accept a token issued before its participant was demoted from moderator
	 * @returns The claims of the token and the room it was verified against
	 * @throws The `401` invalid token error when the token is not valid; a MongoDB or Redis failure is thrown as it is
	 */
	async verifyRoomMemberToken(
		token: string,
		{ clockToleranceSeconds = 0, ignoreDemotion = false } = {}
	): Promise<{
		participantIdentity?: string;
		participantName?: string;
		metadata: MeetRoomMemberTokenMetadata;
		room: RequestRoomSnapshot;
	}> {
		let claims;
		let metadata: MeetRoomMemberTokenMetadata;

		try {
			claims = await this.verifyToken(token, clockToleranceSeconds);

			if (!claims.metadata) {
				throw new Error('Missing required token claims');
			}

			metadata = this.parseRoomMemberTokenMetadata(claims.metadata);
		} catch (error) {
			this.logger.debug('Invalid room member token:', error);
			throw errorInvalidToken();
		}

		const { sub: participantIdentity, name: participantName } = claims;
		const { room, outdatedReason } = await this.checkRoomMemberTokenCurrency(metadata, participantIdentity, {
			ignoreDemotion
		});

		if (!room || outdatedReason) {
			this.logger.debug('Invalid room member token:', outdatedReason);
			throw errorInvalidToken();
		}

		return { participantIdentity, participantName, metadata, room };
	}

	/**
	 * Tells whether a change made after a room member token was issued invalidated it: an update of its room's roles or
	 * access, of its room member's permissions or of its user's role, the deletion of that member or user, and a
	 * demotion of its participant unless `ignoreDemotion` is set. The metadata a participant joined a meeting with is
	 * checked the same way. A database or Redis failure is thrown, never taken for an invalidated token.
	 *
	 * @param ignoreDemotion - Accept a token issued before its participant was demoted from moderator
	 * @returns The token's room, and why the token is no longer valid when it is not
	 */
	async checkRoomMemberTokenCurrency(
		{ iat, issuedAfterRevocation, roomId, memberId, userId }: MeetRoomMemberTokenMetadata,
		participantIdentity: string | undefined,
		{ ignoreDemotion = false } = {}
	): Promise<{ room: RequestRoomSnapshot | null; outdatedReason?: string }> {
		const [room, revoked, roomMember, user] = await Promise.all([
			this.roomRepository.findByRoomId(roomId, REQUEST_ROOM_FIELDS),
			!ignoreDemotion && participantIdentity
				? this.participantTokenRevocationService.isRevoked(roomId, participantIdentity, {
						issuedAfterRevocation
					})
				: false,
			memberId
				? this.roomMemberRepository.findByRoomAndMemberId(roomId, memberId, ['permissionsUpdatedAt'])
				: undefined,
			userId ? this.userRepository.findByUserId(userId, ['roleUpdatedAt']) : undefined
		]);

		if (!room || iat < room.rolesUpdatedAt) {
			return { room, outdatedReason: 'Token has outdated permissions' };
		}

		if (revoked) {
			return { room, outdatedReason: 'Token was issued before the participant role changed' };
		}

		if (memberId && (!roomMember || iat < roomMember.permissionsUpdatedAt)) {
			return { room, outdatedReason: 'Token has outdated permissions' };
		}

		if (userId && (!user || iat < user.roleUpdatedAt)) {
			return { room, outdatedReason: 'Token has outdated permissions' };
		}

		return { room };
	}

	/**
	 * Decodes a JWT and returns its ClaimGrants, even if expired.
	 */
	getClaimsIgnoringExpiration(token: string): ClaimGrants {
		try {
			const decoded = jwtDecode<ClaimGrants>(token);
			return decoded;
		} catch (error) {
			this.logger.debug('Failed to decode JWT:', error);
			throw error;
		}
	}
}
