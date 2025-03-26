import { NextFunction, Request, RequestHandler, Response } from 'express';
import { LoggerService, TokenService, UserService } from '../services/index.js';
import {
	ACCESS_TOKEN_COOKIE_NAME,
	MEET_ANONYMOUS_USER,
	MEET_API_KEY,
	MEET_API_USER,
	PARTICIPANT_TOKEN_COOKIE_NAME
} from '../environment.js';
import { container } from '../config/dependency-injector.config.js';
import { ClaimGrants } from 'livekit-server-sdk';
import { User, UserRole } from '@typings-ce';
import {
	errorUnauthorized,
	errorInvalidToken,
	errorInvalidTokenSubject,
	errorInsufficientPermissions,
	errorInvalidApiKey,
	OpenViduMeetError
} from '../models/index.js';

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
				// If no middleware granted access, return unauthorized
				if (error instanceof OpenViduMeetError) {
					lastError = error;
				}
			}
		}

		if (lastError) {
			return res.status(lastError.statusCode).json({ message: lastError.message });
		}

		return res.status(500).json({ message: 'Internal server error' });
	};
};

// Configure token validatior for role-based access
export const tokenAndRoleValidator = (role: UserRole) => {
	return async (req: Request) => {
		const token = req.cookies[ACCESS_TOKEN_COOKIE_NAME];

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

		if (user.role !== role) {
			throw errorInsufficientPermissions();
		}

		req.session = req.session || {};
		req.session.user = user;
	};
};

// Configure token validatior for participant access
export const participantTokenValidator = async (req: Request) => {
	const token = req.cookies[PARTICIPANT_TOKEN_COOKIE_NAME];

	if (!token) {
		throw errorUnauthorized();
	}

	const tokenService = container.get(TokenService);

	try {
		const payload = await tokenService.verifyToken(token);
		req.session = req.session || {};
		req.session.tokenClaims = payload;
	} catch (error) {
		throw errorInvalidToken();
	}
};

// Configure API key validatior
export const apiKeyValidator = async (req: Request) => {
	const apiKey = req.headers['x-api-key'];

	if (!apiKey) {
		throw errorUnauthorized();
	}

	if (apiKey !== MEET_API_KEY) {
		throw errorInvalidApiKey();
	}

	const apiUser = {
		username: MEET_API_USER,
		role: UserRole.APP
	};

	req.session = req.session || {};
	req.session.user = apiUser;
};

// Allow anonymous access
export const allowAnonymous = async (req: Request) => {
	let user: User | null = null;

	// Check if there is a user already authenticated
	const token = req.cookies[ACCESS_TOKEN_COOKIE_NAME];

	if (token) {
		try {
			const tokenService = container.get(TokenService);
			const payload = await tokenService.verifyToken(token);
			const username = payload.sub;
			const userService = container.get(UserService);
			user = username ? await userService.getUser(username) : null;
		} catch (error) {
			const logger = container.get(LoggerService);
			logger.debug('Token found but invalid:' + error);
		}
	}

	if (!user) {
		user = {
			username: MEET_ANONYMOUS_USER,
			role: UserRole.USER
		};
	}

	req.session = req.session || {};
	req.session.user = user;
};
