import { OpenViduMeetPermissions, ParticipantRole, User, UserRole } from '@typings-ce';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ClaimGrants } from 'livekit-server-sdk';
import ms from 'ms';
import { container } from '../config/index.js';
import INTERNAL_CONFIG from '../config/internal-config.js';
import {
	errorInsufficientPermissions,
	errorInvalidApiKey,
	errorInvalidParticipantRole,
	errorInvalidToken,
	errorInvalidTokenSubject,
	errorUnauthorized,
	internalError,
	OpenViduMeetError,
	rejectRequestFromMeetError
} from '../models/index.js';
import { AuthService, LoggerService, TokenService, UserService } from '../services/index.js';

/**
 * This middleware allows to chain multiple validators to check if the request is authorized.
 * If any of the validators grants access, the request is allowed to continue, skipping the rest of the validators.
 * If none of the validators grants access, the request is rejected with an unauthorized error.
 *
 * @param validators List of validators to check if the request is authorized
 * @returns RequestHandler middleware
 */
export const withAuth = (...validators: ((req: Request) => Promise<void>)[]): RequestHandler => {
	return async (req: Request, res: Response, next: NextFunction) => {
		let lastError: OpenViduMeetError | null = null;

		for (const validator of validators) {
			try {
				await validator(req);
				// If any middleware granted access, it is not necessary to continue checking the rest
				return next();
			} catch (error) {
				if (isErrorWithControl(error)) {
					lastError = error.error;

					if (error.stopValidation) {
						// Stop checking other validators
						break;
					}
				}
			}
		}

		if (lastError) {
			return rejectRequestFromMeetError(res, lastError);
		}

		const error = internalError('authenticating user');
		return rejectRequestFromMeetError(res, error);
	};
};

// Configure token validatior for role-based access
export const tokenAndRoleValidator = (role: UserRole) => {
	return async (req: Request) => {
		const token = req.cookies[INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME];

		if (!token) {
			throw errorWithControl(errorUnauthorized(), false);
		}

		const tokenService = container.get(TokenService);
		let payload: ClaimGrants;

		try {
			payload = await tokenService.verifyToken(token);
		} catch (error) {
			throw errorWithControl(errorInvalidToken(), true);
		}

		const username = payload.sub;
		const userService = container.get(UserService);
		const user = username ? await userService.getUser(username) : null;

		if (!user) {
			throw errorWithControl(errorInvalidTokenSubject(), true);
		}

		if (!user.roles.includes(role)) {
			throw errorWithControl(errorInsufficientPermissions(), false);
		}

		req.session = req.session || {};
		req.session.user = user;
	};
};

// Configure token validator for participant access
export const participantTokenValidator = async (req: Request) => {
	await validateTokenAndSetSession(req, INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME);
};

// Configure token validator for recording access
export const recordingTokenValidator = async (req: Request) => {
	await validateTokenAndSetSession(req, INTERNAL_CONFIG.RECORDING_TOKEN_COOKIE_NAME);
};

const validateTokenAndSetSession = async (req: Request, cookieName: string) => {
	const token = req.cookies[cookieName];

	if (!token) {
		throw errorWithControl(errorUnauthorized(), false);
	}

	const tokenService = container.get(TokenService);
	let payload: ClaimGrants;

	try {
		payload = await tokenService.verifyToken(token);
		const user = await getAuthenticatedUserOrAnonymous(req);

		req.session = req.session || {};
		req.session.tokenClaims = payload;
		req.session.user = user;
	} catch (error) {
		throw errorWithControl(errorInvalidToken(), true);
	}

	// If the token is a participant token, set the participant role in the session
	if (cookieName === INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME) {
		const participantRole = req.headers[INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER];
		const allRoles = [ParticipantRole.MODERATOR, ParticipantRole.PUBLISHER];

		// Ensure the participant role is provided and valid
		// This is required to distinguish roles when multiple are present in the token
		if (!participantRole || !allRoles.includes(participantRole as ParticipantRole)) {
			throw errorWithControl(errorInvalidParticipantRole(), true);
		}

		// Check that the specified role is present in the token claims
		const metadata = JSON.parse(payload.metadata || '{}');
		const roles = metadata.roles || [];
		const hasRole = roles.some(
			(r: { role: ParticipantRole; permissions: OpenViduMeetPermissions }) => r.role === participantRole
		);

		if (!hasRole) {
			throw errorWithControl(errorInsufficientPermissions(), true);
		}

		req.session.participantRole = participantRole as ParticipantRole;
	}
};

// Configure API key validatior
export const apiKeyValidator = async (req: Request) => {
	const apiKey = req.headers[INTERNAL_CONFIG.API_KEY_HEADER];

	if (!apiKey) {
		throw errorWithControl(errorUnauthorized(), false);
	}

	try {
		const authService = container.get(AuthService);
		const isValidApiKey = await authService.validateApiKey(apiKey as string);

		if (!isValidApiKey) {
			throw errorInvalidApiKey();
		}
	} catch (error) {
		if (error instanceof OpenViduMeetError) {
			throw errorWithControl(error, true);
		} else {
			const logger = container.get(LoggerService);
			logger.error('Error validating API key:', error);
			throw errorWithControl(internalError('validating API key'), true);
		}
	}

	const userService = container.get(UserService);
	const apiUser = userService.getApiUser();

	req.session = req.session || {};
	req.session.user = apiUser;
};

// Allow anonymous access
export const allowAnonymous = async (req: Request) => {
	const user = await getAuthenticatedUserOrAnonymous(req);

	req.session = req.session || {};
	req.session.user = user;
};

// Return the authenticated user if available, otherwise return an anonymous user
const getAuthenticatedUserOrAnonymous = async (req: Request): Promise<User> => {
	const userService = container.get(UserService);
	let user: User | null = null;

	// Check if there is a user already authenticated
	const token = req.cookies[INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME];

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
	windowMs: ms('15m'),
	limit: 5,
	message: 'Too many login attempts, please try again later'
});

export const withLoginLimiter = (req: Request, res: Response, next: NextFunction) => {
	// Bypass rate limiting in test environment
	if (process.env.NODE_ENV === 'test') {
		return next();
	}

	return loginLimiter(req, res, next);
};

// OpenViduMeetError with control to stop checking other validators
interface ErrorWithControl {
	error: OpenViduMeetError;
	stopValidation: boolean;
}

const errorWithControl = (error: OpenViduMeetError, stopValidation: boolean): ErrorWithControl => {
	const errorWithControl: ErrorWithControl = {
		error,
		stopValidation
	};
	return errorWithControl;
};

const isErrorWithControl = (error: unknown): error is ErrorWithControl => {
	return typeof error === 'object' && error !== null && 'error' in error && 'stopValidation' in error;
};
