import type { MeetRoomMemberTokenMetadata, MeetUserRole } from '@openvidu-meet/typings';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import {
	OpenViduMeetError,
	errorInsufficientPermissions,
	errorInvalidApiKey,
	errorInvalidApiKeySubject,
	errorInvalidToken,
	errorInvalidTokenSubject,
	errorPasswordChangeRequired,
	errorUnauthorized,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import type { RequestRoomSnapshot } from '../models/request-context.model.js';
import type { TokenMetadata } from '../models/token.model.js';
import { TokenType } from '../models/token.model.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { ApiKeyService } from '../services/api-key.service.js';
import { LoggerService } from '../services/logger.service.js';
import { ParticipantTokenRevocationService } from '../services/participant-token-revocation.service.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { TokenService } from '../services/token.service.js';
import { UserTokenRevocationService } from '../services/user-token-revocation.service.js';
import { UserService } from '../services/user.service.js';
import { getAccessToken, getRoomMemberToken } from '../utils/token.utils.js';

/**
 * Interface for authentication validators.
 * Each validator must implement methods to check if credentials are present and to validate them.
 */
export interface AuthValidator {
	/**
	 * Returns the priority of this validator (higher number = higher priority).
	 * Priority order: apiKeyValidator (4) > roomMemberTokenValidator (3) > accessTokenValidator (2) > allowAnonymous (1)
	 */
	getPriority(): number;

	/**
	 * Checks if the authentication credentials for this validator are present in the request.
	 * This allows the middleware to skip validation for methods that are not being used.
	 */
	isPresent(req: Request): boolean | Promise<boolean>;

	/**
	 * Validates the authentication credentials and sets the session.
	 */
	validate(req: Request): Promise<void>;
}

/**
 * This middleware allows to chain multiple validators to check if the request is authorized.
 * Validators are automatically sorted by priority: apiKeyValidator > roomMemberTokenValidator > accessTokenValidator > allowAnonymous.
 * Only validates the authentication methods that are present in the request.
 * If any of the validators grants access, the request is allowed to continue.
 * If a validator is present but fails validation, the error is returned immediately.
 * If none are present, the request is rejected with unauthorized error.
 *
 * @param validators List of validators to check if the request is authorized
 * @returns RequestHandler middleware
 */
export const withAuth = (...validators: AuthValidator[]): RequestHandler => {
	return async (req: Request, res: Response, next: NextFunction) => {
		// Sort validators by priority (descending)
		const sortedValidators = [...validators].sort((a, b) => {
			return b.getPriority() - a.getPriority();
		});

		for (const validator of sortedValidators) {
			const isPresent = await validator.isPresent(req);

			if (isPresent) {
				try {
					await validator.validate(req);
					// If validator grants access, allow the request to continue
					return next();
				} catch (error) {
					// If a present validator fails, return the error immediately
					if (error instanceof OpenViduMeetError) {
						return rejectRequestFromMeetError(res, error);
					}

					// A non-Meet error here is unexpected (e.g. Mongo/Redis down while resolving
					// the user, room or permissions).
					const logger = container.get(LoggerService);
					logger.error('Unexpected error while authenticating request', error);
					return rejectRequestFromMeetError(res, errorUnauthorized());
				}
			}
		}

		// No validator was present, return unauthorized
		return rejectRequestFromMeetError(res, errorUnauthorized());
	};
};

const createAccessTokenValidator = (roles: MeetUserRole[], admitsPendingPasswordChange: boolean): AuthValidator => {
	return {
		getPriority(): number {
			return 2;
		},

		isPresent(req: Request): boolean {
			const token = getAccessToken(req);
			return !!token;
		},

		async validate(req: Request): Promise<void> {
			const token = getAccessToken(req);

			if (!token) {
				throw errorUnauthorized();
			}

			let userId: string | undefined;
			let metadata: TokenMetadata;

			try {
				// Verify the token and extract the user ID and token metadata
				const tokenService = container.get(TokenService);
				const { sub, metadata: tokenMetadata } = await tokenService.verifyToken(token);

				if (!tokenMetadata) {
					throw new Error('Missing required token claims');
				}

				// Validate that this is an access or temporary token, not a refresh token
				metadata = tokenService.parseTokenMetadata(tokenMetadata);
				userId = sub;

				if (metadata.tokenType === TokenType.REFRESH) {
					throw new Error('Invalid token type for access');
				}
			} catch (error) {
				const logger = container.get(LoggerService);
				logger.debug('Invalid access token:', error);
				throw errorInvalidToken();
			}

			const userService = container.get(UserService);
			const user = userId ? await userService.getUser(userId) : null;

			if (!user) {
				throw errorInvalidTokenSubject();
			}

			if (metadata.iat < user.roleUpdatedAt || (await isRevokedUserToken(user.userId, metadata))) {
				throw errorInvalidToken();
			}

			if (
				!admitsPendingPasswordChange &&
				(user.mustChangePassword || metadata.tokenType === TokenType.TEMPORARY)
			) {
				throw errorPasswordChangeRequired();
			}

			// Check if user has one of the required roles
			if (!roles.includes(user.role)) {
				throw errorInsufficientPermissions();
			}

			const requestSessionService = container.get(RequestSessionService);
			requestSessionService.setUser(user);
		}
	};
};

/**
 * Access token validator for user access.
 * Validates access tokens and user roles, and sets the authenticated user in the session.
 * A user with a pending password change, or a temporary token, is refused.
 *
 * @param roles One or more roles that are allowed to access the resource
 */
export const accessTokenValidator = (...roles: MeetUserRole[]): AuthValidator =>
	createAccessTokenValidator(roles, false);

/**
 * Access token validator for the endpoints that complete a pending password change.
 * Same as {@link accessTokenValidator}, but also admits a user with a pending password change and a temporary token.
 *
 * @param roles One or more roles that are allowed to access the resource
 */
export const pendingPasswordChangeTokenValidator = (...roles: MeetUserRole[]): AuthValidator =>
	createAccessTokenValidator(roles, true);

/**
 * Room member token validator for room access.
 * Validates room member tokens and sets the room member metadata in the session.
 */
export const roomMemberTokenValidator: AuthValidator = {
	getPriority(): number {
		return 3;
	},

	isPresent(req: Request): boolean {
		const token = getRoomMemberToken(req);
		return !!token;
	},

	async validate(req: Request): Promise<void> {
		const token = getRoomMemberToken(req);

		if (!token) {
			throw errorUnauthorized();
		}

		const { participantIdentity, metadata, room } = await verifyRoomMemberToken(token);
		const requestSessionService = container.get(RequestSessionService);
		requestSessionService.setRoomMemberTokenInfo(metadata, participantIdentity);
		requestSessionService.setRoom(room);

		await setAuthenticatedUserIfPresent(req);
	}
};

const REQUEST_ROOM_SNAPSHOT_FIELDS = [
	'roomId',
	'rolesUpdatedAt',
	'config'
] as const satisfies readonly (keyof RequestRoomSnapshot)[];

/**
 * Verifies a room member token and that no later change invalidated it: an update of its room's roles or access,
 * of its room member's permissions or of its user's role, the deletion of that member or user, and a demotion of
 * its participant unless `ignoreDemotion` is set.
 *
 * @param clockToleranceSeconds - How long after its expiry the token is still accepted
 * @param ignoreDemotion - Accept a token issued before its participant was demoted from moderator
 * @returns The claims of the token and the room it was verified against
 * @throws The `401` invalid token error when the token is not valid
 */
export const verifyRoomMemberToken = async (
	token: string,
	{ clockToleranceSeconds = 0, ignoreDemotion = false } = {}
): Promise<{
	participantIdentity?: string;
	participantName?: string;
	metadata: MeetRoomMemberTokenMetadata;
	room: RequestRoomSnapshot;
}> => {
	try {
		const tokenService = container.get(TokenService);
		const {
			sub: participantIdentity,
			name: participantName,
			metadata: tokenMetadata
		} = await tokenService.verifyToken(token, clockToleranceSeconds);

		if (!tokenMetadata) {
			throw new Error('Missing required token claims');
		}

		const metadata = tokenService.parseRoomMemberTokenMetadata(tokenMetadata);
		const { iat, roomId, memberId, userId } = metadata;

		const [room, revoked, roomMember, user] = await Promise.all([
			container.get(RoomRepository).findByRoomId(roomId, REQUEST_ROOM_SNAPSHOT_FIELDS),
			!ignoreDemotion && participantIdentity
				? container.get(ParticipantTokenRevocationService).isRevoked(roomId, participantIdentity, iat)
				: false,
			memberId
				? container.get(RoomMemberRepository).findByRoomAndMemberId(roomId, memberId, ['permissionsUpdatedAt'])
				: undefined,
			userId ? container.get(UserService).getUser(userId, ['roleUpdatedAt']) : undefined
		]);

		if (!room || iat < room.rolesUpdatedAt) {
			throw new Error('Token has outdated permissions');
		}

		if (revoked) {
			throw new Error('Token was issued before the participant role changed');
		}

		if (memberId && (!roomMember || iat < roomMember.permissionsUpdatedAt)) {
			throw new Error('Token has outdated permissions');
		}

		if (userId && (!user || iat < user.roleUpdatedAt)) {
			throw new Error('Token has outdated permissions');
		}

		return { participantIdentity, participantName, metadata, room };
	} catch (error) {
		container.get(LoggerService).debug('Invalid room member token:', error);
		throw errorInvalidToken();
	}
};

/**
 * API key validator for service-to-service authentication.
 * Validates API keys from request headers.
 */
export const apiKeyValidator: AuthValidator = {
	getPriority(): number {
		return 4;
	},

	isPresent(req: Request): boolean {
		const apiKey = req.headers[INTERNAL_CONFIG.API_KEY_HEADER];
		return !!apiKey;
	},

	async validate(req: Request): Promise<void> {
		const apiKey = req.headers[INTERNAL_CONFIG.API_KEY_HEADER];

		if (!apiKey) {
			throw errorUnauthorized();
		}

		const apiKeyService = container.get(ApiKeyService);
		const isValidApiKey = await apiKeyService.validateApiKey(apiKey as string);

		if (!isValidApiKey) {
			throw errorInvalidApiKey();
		}

		const userService = container.get(UserService);
		const apiUser = await userService.getUserAssociatedWithApiKey();

		if (!apiUser) {
			throw errorInvalidApiKeySubject();
		}

		const requestSessionService = container.get(RequestSessionService);
		requestSessionService.setUser(apiUser);
	}
};

/**
 * Anonymous access validator.
 * Allows unauthenticated access with an anonymous user.
 */
export const allowAnonymous: AuthValidator = {
	getPriority(): number {
		return 1;
	},

	isPresent(): boolean {
		// Anonymous access is always available
		return true;
	},

	async validate(req: Request): Promise<void> {
		await setAuthenticatedUserIfPresent(req);
	}
};

/**
 * Set authenticated user in request context if access token is present and valid
 */
const setAuthenticatedUserIfPresent = async (req: Request): Promise<void> => {
	// Check if there is a user already authenticated
	const token = getAccessToken(req);

	if (!token) {
		return;
	}

	try {
		const tokenService = container.get(TokenService);
		const { sub: userId, metadata } = await tokenService.verifyToken(token);

		const userService = container.get(UserService);
		const user = userId ? await userService.getUser(userId) : null;

		if (user && !(await isRevokedUserToken(user.userId, tokenService.parseTokenMetadata(metadata ?? '')))) {
			const requestSessionService = container.get(RequestSessionService);
			requestSessionService.setUser(user);
		}
	} catch (error) {
		const logger = container.get(LoggerService);
		logger.debug('Token found but invalid:', error);
	}
};

const isRevokedUserToken = (userId: string, metadata: TokenMetadata): Promise<boolean> =>
	container.get(UserTokenRevocationService).isRevoked(userId, metadata);
