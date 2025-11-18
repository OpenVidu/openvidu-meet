import { LiveKitPermissions, MeetUser, MeetUserRole } from '@openvidu-meet/typings';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ClaimGrants } from 'livekit-server-sdk';
import ms from 'ms';
import { container } from '../config/index.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import {
	errorInsufficientPermissions,
	errorInvalidApiKey,
	errorInvalidRoomMemberToken,
	errorInvalidToken,
	errorInvalidTokenSubject,
	errorUnauthorized,
	OpenViduMeetError,
	rejectRequestFromMeetError
} from '../models/index.js';
import {
	ApiKeyService,
	LoggerService,
	RequestSessionService,
	RoomMemberService,
	TokenService,
	UserService
} from '../services/index.js';
import { getAccessToken, getRoomMemberToken } from '../utils/index.js';

/**
 * Interface for authentication validators.
 * Each validator must implement methods to check if credentials are present and to validate them.
 */
interface AuthValidator {
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
 * First checks which authentication methods are present in the request, then validates only those methods.
 * If any of the validators grants access, the request is allowed to continue.
 * If none of the validators grants access, the request is rejected with the most recent error.
 *
 * @param validators List of validators to check if the request is authorized
 * @returns RequestHandler middleware
 */
export const withAuth = (...validators: AuthValidator[]): RequestHandler => {
	return async (req: Request, res: Response, next: NextFunction) => {
		let lastError: OpenViduMeetError | null = null;

		for (const validator of validators) {
			try {
				if (await validator.isPresent(req)) {
					await validator.validate(req);
					// If any validator grants access, allow the request to continue
					return next();
				}
			} catch (error) {
				if (error instanceof OpenViduMeetError) {
					lastError = error;
				}
			}
		}

		lastError = lastError || errorUnauthorized();
		return rejectRequestFromMeetError(res, lastError);
	};
};

/**
 * Token and role validator for role-based access.
 * Validates JWT tokens and checks if the user has at least one of the required roles.
 *
 * @param roles One or more roles that are allowed to access the resource
 */
export const tokenAndRoleValidator = (...roles: MeetUserRole[]): AuthValidator => {
	return {
		async isPresent(req: Request): Promise<boolean> {
			const token = getAccessToken(req);
			return !!token;
		},

		async validate(req: Request): Promise<void> {
			const token = getAccessToken(req);

			if (!token) {
				throw errorUnauthorized();
			}

			const tokenService = container.get(TokenService);
			let payload: ClaimGrants;

			try {
				payload = await tokenService.verifyToken(token);
			} catch (error) {
				throw errorInvalidToken();
			}

			const username = payload.sub;
			const userService = container.get(UserService);
			const user = username ? await userService.getUser(username) : null;

			if (!user) {
				throw errorInvalidTokenSubject();
			}

			// Check if user has at least one of the required roles
			const hasRequiredRole = roles.some((role) => user.roles.includes(role));

			if (!hasRequiredRole) {
				throw errorInsufficientPermissions();
			}

			const requestSessionService = container.get(RequestSessionService);
			requestSessionService.setUser(user);
		}
	};
};

/**
 * Room member token validator for room access.
 * Validates room member tokens and checks role permissions.
 */
export const roomMemberTokenValidator: AuthValidator = {
	async isPresent(req: Request): Promise<boolean> {
		const token = getRoomMemberToken(req);
		return !!token;
	},

	async validate(req: Request): Promise<void> {
		const token = getRoomMemberToken(req);

		if (!token) {
			throw errorUnauthorized();
		}

		let tokenMetadata: string | undefined;
		let livekitPermissions: LiveKitPermissions | undefined;

		try {
			const tokenService = container.get(TokenService);
			({ metadata: tokenMetadata, video: livekitPermissions } = await tokenService.verifyToken(token));

			if (!tokenMetadata || !livekitPermissions) {
				throw new Error('Missing required token claims');
			}
		} catch (error) {
			throw errorInvalidToken();
		}

		const requestSessionService = container.get(RequestSessionService);

		// Validate the room member token metadata and extract role and permissions
		try {
			const roomMemberService = container.get(RoomMemberService);
			const { role, permissions: meetPermissions } =
				roomMemberService.parseRoomMemberTokenMetadata(tokenMetadata);

			requestSessionService.setRoomMemberTokenInfo(role, meetPermissions, livekitPermissions);
		} catch (error) {
			const logger = container.get(LoggerService);
			logger.error('Invalid room member token:', error);
			throw errorInvalidRoomMemberToken();
		}

		// Set authenticated user if present, otherwise anonymous
		const user = await getAuthenticatedUserOrAnonymous(req);
		requestSessionService.setUser(user);
	}
};

/**
 * API key validator for service-to-service authentication.
 * Validates API keys from request headers.
 */
export const apiKeyValidator: AuthValidator = {
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
		const apiUser = userService.getApiUser();

		const requestSessionService = container.get(RequestSessionService);
		requestSessionService.setUser(apiUser);
	}
};

/**
 * Anonymous access validator.
 * Always present and allows unauthenticated access with an anonymous user.
 */
export const allowAnonymous: AuthValidator = {
	async isPresent(): Promise<boolean> {
		// Anonymous access is always available
		return true;
	},

	async validate(req: Request): Promise<void> {
		const user = await getAuthenticatedUserOrAnonymous(req);

		const requestSessionService = container.get(RequestSessionService);
		requestSessionService.setUser(user);
	}
};

// Return the authenticated user if available, otherwise return an anonymous user
const getAuthenticatedUserOrAnonymous = async (req: Request): Promise<MeetUser> => {
	const userService = container.get(UserService);
	let user: MeetUser | null = null;

	// Check if there is a user already authenticated
	const token = getAccessToken(req);

	if (token) {
		try {
			const tokenService = container.get(TokenService);
			const payload = await tokenService.verifyToken(token);
			const username = payload.sub;
			user = username ? await userService.getUser(username) : null;
		} catch (error) {
			const logger = container.get(LoggerService);
			logger.debug('Token found but invalid:' + error);
		}
	}

	if (!user) {
		user = userService.getAnonymousUser();
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
