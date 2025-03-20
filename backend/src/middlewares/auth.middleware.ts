import { NextFunction, Request, RequestHandler, Response } from 'express';
import { TokenService, UserService } from '../services/index.js';
import {
	ACCESS_TOKEN_COOKIE_NAME,
	MEET_API_KEY,
	MEET_PRIVATE_ACCESS,
	PARTICIPANT_TOKEN_COOKIE_NAME
} from '../environment.js';
import { container } from '../config/dependency-injector.config.js';
import { ClaimGrants } from 'livekit-server-sdk';
import { Role } from '@typings-ce';
import {
	errorUnauthorized,
	errorInvalidToken,
	errorInvalidTokenSubject,
	errorInsufficientPermissions,
	errorInvalidApiKey,
	OpenViduMeetError
} from '../models/index.js';

export const withAuth = (...validators: ((req: Request) => Promise<void>)[]): RequestHandler => {
	return async (req: Request, res: Response, next: NextFunction) => {
		let lastError: OpenViduMeetError | null = null;

		for (const middleware of validators) {
			try {
				await middleware(req);
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
export const tokenAndRoleValidator = (role: Role) => {
	return async (req: Request) => {
		// Skip token validation if role is USER and access is public
		if (role == Role.USER && MEET_PRIVATE_ACCESS === 'false') {
			return;
		}

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
		const user = username ? userService.getUser(username) : null;

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
};
