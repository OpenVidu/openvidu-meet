import { MeetUser, MeetUserRole } from '@openvidu-meet/typings';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import ms from 'ms';
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
import { TokenType } from '../models/token-metadata.model.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { ApiKeyService } from '../services/api-key.service.js';
import { LoggerService } from '../services/logger.service.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { TokenService } from '../services/token.service.js';
import { UserService } from '../services/user.service.js';
import { getAccessToken, getRoomMemberToken } from '../utils/token.utils.js';
import { RoomRepository } from '../repositories/room.repository.js';

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
	isPresent(req: Request): Promise<boolean>;

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
					const meetError = error instanceof OpenViduMeetError ? error : errorUnauthorized();
					return rejectRequestFromMeetError(res, meetError);
				}
			}
		}

		// No validator was present, return unauthorized
		return rejectRequestFromMeetError(res, errorUnauthorized());
	};
};

/**
 * Access token validator for user access.
 * Validates access tokens and user roles, and sets the authenticated user in the session.
 *
 * @param roles One or more roles that are allowed to access the resource
 */
export const accessTokenValidator = (...roles: MeetUserRole[]): AuthValidator => {
	return {
		getPriority(): number {
			return 2;
		},

		async isPresent(req: Request): Promise<boolean> {
			const token = getAccessToken(req);
			return !!token;
		},

		async validate(req: Request): Promise<void> {
			const token = getAccessToken(req);

			if (!token) {
				throw errorUnauthorized();
			}

			let userId: string | undefined;
			let tokenType: TokenType;

			try {
				// Verify the token and extract the user ID and token metadata
				const tokenService = container.get(TokenService);
				const { sub, metadata: tokenMetadata } = await tokenService.verifyToken(token);

				if (!tokenMetadata) {
					throw new Error('Missing required token claims');
				}

				// Validate that this is an access or temporary token, not a refresh token
				const parsedMetadata = tokenService.parseTokenMetadata(tokenMetadata);
				userId = sub;
				tokenType = parsedMetadata.tokenType;

				if (tokenType === TokenType.REFRESH) {
					throw new Error('Invalid token type for access');
				}
			} catch (error) {
				const logger = container.get(LoggerService);
				logger.error('Invalid access token:', error);
				throw errorInvalidToken();
			}

			const userService = container.get(UserService);
			const user = userId ? await userService.getUser(userId) : null;

			if (!user) {
				throw errorInvalidTokenSubject();
			}

			// Restrict access if password change is required or if token is temporary
			if (user.mustChangePassword || tokenType === TokenType.TEMPORARY) {
				// Allow only change-password and me endpoints
				const requestPath = req.path;
				const allowedPaths = ['/change-password', '/me'];

				if (!allowedPaths.includes(requestPath)) {
					throw errorPasswordChangeRequired();
				}
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
 * Room member token validator for room access.
 * Validates room member tokens and sets the room member metadata in the session.
 */
export const roomMemberTokenValidator: AuthValidator = {
	getPriority(): number {
		return 3;
	},

	async isPresent(req: Request): Promise<boolean> {
		const token = getRoomMemberToken(req);
		return !!token;
	},

	async validate(req: Request): Promise<void> {
		const token = getRoomMemberToken(req);

		if (!token) {
			throw errorUnauthorized();
		}

		const requestSessionService = container.get(RequestSessionService);

		try {
			// Verify the token and extract the room member token metadata
			const tokenService = container.get(TokenService);
			const { iat, metadata: tokenMetadata } = await tokenService.verifyToken(token);

			if (!tokenMetadata) {
				throw new Error('Missing required token claims');
			}

			// Validate the room member token metadata
			const parsedMetadata = tokenService.parseRoomMemberTokenMetadata(tokenMetadata);
			const { roomId, memberId } = parsedMetadata;

			// If the token has a memberId, validate that permissions haven't been updated after token issuance
			if (memberId && iat) {
				const roomMemberRepository = container.get(RoomMemberRepository);
				const roomMember = await roomMemberRepository.findByRoomAndMemberId(roomId, memberId);

				// If member not found or permissions were updated after token issuance, invalidate token
				if (!roomMember || iat < roomMember.permissionsUpdatedAt) {
					throw new Error('Token has outdated permissions');
				}
			} else if (!memberId && iat) {
				// If the token has no memberId (anonymous access), validate that room roles/anonymous haven't been updated
				const roomRepository = container.get(RoomRepository);
				const room = await roomRepository.findByRoomId(roomId, 'rolesUpdatedAt');

				// If room not found or roles/anonymous were updated after token issuance, invalidate token
				if (!room || iat < room.rolesUpdatedAt) {
					throw new Error('Token has outdated permissions');
				}
			}

			// Set room member token metadata in the session
			requestSessionService.setRoomMemberTokenMetadata(parsedMetadata);
		} catch (error) {
			const logger = container.get(LoggerService);
			logger.error('Invalid room member token:', error);
			throw errorInvalidToken();
		}

		// Set authenticated user if present
		const user = await getAuthenticatedUserOrAnonymous(req);

		if (user) {
			requestSessionService.setUser(user);
		}
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

	async isPresent(req: Request): Promise<boolean> {
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

	async isPresent(): Promise<boolean> {
		// Anonymous access is always available
		return true;
	},

	async validate(req: Request): Promise<void> {
		const user = await getAuthenticatedUserOrAnonymous(req);

		if (user) {
			const requestSessionService = container.get(RequestSessionService);
			requestSessionService.setUser(user);
		}
	}
};

// Return the authenticated user if available, otherwise return null
const getAuthenticatedUserOrAnonymous = async (req: Request): Promise<MeetUser | null> => {
	let user: MeetUser | null = null;

	// Check if there is a user already authenticated
	const token = getAccessToken(req);

	if (token) {
		try {
			const tokenService = container.get(TokenService);
			const payload = await tokenService.verifyToken(token);
			const userId = payload.sub;

			const userService = container.get(UserService);
			user = userId ? await userService.getUser(userId) : null;
		} catch (error) {
			const logger = container.get(LoggerService);
			logger.debug('Token found but invalid:' + error);
		}
	}

	return user;
};

// Limit login attempts to avoid brute force attacks
const loginLimiter = rateLimit({
	windowMs: ms('5m'),
	limit: 5,
	skipSuccessfulRequests: true,
	message: 'Too many login attempts, please try again later',
	// Use standard draft-7 headers for better proxy compatibility
	standardHeaders: 'draft-7',
	// Disable legacy headers
	legacyHeaders: false
});

export const withLoginLimiter = (req: Request, res: Response, next: NextFunction) => {
	// Bypass rate limiting in test environment
	if (process.env.NODE_ENV === 'test') {
		return next();
	}

	return loginLimiter(req, res, next);
};
