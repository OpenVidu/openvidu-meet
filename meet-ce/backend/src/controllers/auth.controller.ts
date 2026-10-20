import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { MEET_ENV } from '../environment.js';
import {
	errorInvalidCredentials,
	errorInvalidRefreshToken,
	errorInvalidTokenSubject,
	errorPasswordChangeRequired,
	errorRefreshTokenNotPresent,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import type { TokenMetadata } from '../models/token.model.js';
import { TokenType } from '../models/token.model.js';
import { LoggerService } from '../services/logger.service.js';
import { TokenService } from '../services/token.service.js';
import { UserTokenRevocationService } from '../services/user-token-revocation.service.js';
import { UserService } from '../services/user.service.js';
import { getAccessToken, getRefreshToken } from '../utils/token.utils.js';

export const login = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Login request received');
	const { userId, password } = req.body as { userId: string; password: string };

	const userService = container.get(UserService);

	let user;

	try {
		user = await userService.authenticateUser(userId, password);
	} catch (error) {
		// A failure here is an infrastructure error (e.g. Mongo down), not a bad credential:
		// route it through handleError so it is logged at error and masked as 500, instead of
		// escaping the handler as an unlabelled rejection.
		return handleError(res, error, 'authenticating user');
	}

	if (!user) {
		logger.warn(`Login failed for user '${userId}'`);
		const error = errorInvalidCredentials();
		return rejectRequestFromMeetError(res, error);
	}

	try {
		const tokenService = container.get(TokenService);
		const sid = tokenService.createSessionId();

		// Check if password change is required
		if (user.mustChangePassword) {
			// Generate temporary token with limited TTL, no refresh token
			const accessToken = await tokenService.generateAccessToken(user, sid, true);

			logger.info(`Login succeeded for user '${userId}', but password change is required`);
			return res.status(200).json({
				message: `User '${userId}' logged in successfully, but password change is required`,
				accessToken,
				mustChangePassword: true
			});
		}

		// Normal login flow
		const accessToken = await tokenService.generateAccessToken(user, sid);
		const refreshToken = await tokenService.generateRefreshToken(user, sid);

		logger.info(`Login succeeded for user '${userId}'`);
		return res.status(200).json({
			message: `User '${userId}' logged in successfully`,
			accessToken,
			refreshToken
		});
	} catch (error) {
		handleError(res, error, 'generating access and refresh tokens');
	}
};

/**
 * Ends the login session of the access or refresh token the request carries, if any verifies.
 */
export const logout = async (req: Request, res: Response) => {
	const tokens = [getAccessToken(req), getRefreshToken(req)].filter((token): token is string => !!token);
	const sessionIds = (await Promise.all(tokens.map(readSessionId))).filter((sid): sid is string => !!sid);

	try {
		const tokenRevocationService = container.get(UserTokenRevocationService);
		await Promise.all(sessionIds.map((sid) => tokenRevocationService.revokeSession(sid)));
		return res.status(200).json({ message: 'Logout successful' });
	} catch (error) {
		handleError(res, error, 'ending the login session');
	}
};

const readSessionId = async (token: string): Promise<string | undefined> => {
	const tokenService = container.get(TokenService);

	try {
		const { metadata } = await tokenService.verifyToken(token);
		return tokenService.parseTokenMetadata(metadata ?? '').sid;
	} catch {
		return undefined;
	}
};

export const refreshToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Refresh token request received');

	const refreshToken = getRefreshToken(req);

	if (!refreshToken) {
		logger.warn('No refresh token provided');
		const error = errorRefreshTokenNotPresent();
		return rejectRequestFromMeetError(res, error);
	}

	const tokenService = container.get(TokenService);
	let userId: string | undefined;
	let metadata: TokenMetadata;

	try {
		// Verify the token and extract the user ID and token metadata
		const { sub, metadata: tokenMetadata } = await tokenService.verifyToken(refreshToken);

		if (!tokenMetadata) {
			throw new Error('Missing required token claims');
		}

		// Validate that this is actually a refresh token
		metadata = tokenService.parseTokenMetadata(tokenMetadata);
		userId = sub;

		if (metadata.tokenType !== TokenType.REFRESH) {
			throw new Error('Invalid token type for refresh operation');
		}
	} catch (error) {
		logger.warn('Invalid refresh token:', error);
		const meetError = errorInvalidRefreshToken();
		return rejectRequestFromMeetError(res, meetError);
	}

	const userService = container.get(UserService);

	let user;

	try {
		user = userId ? await userService.getUser(userId) : null;
	} catch (error) {
		// A failure resolving the user is an infrastructure error, not an invalid token:
		// route it through handleError so it is logged at error and masked as 500, instead of
		// escaping the handler as an unlabelled rejection.
		return handleError(res, error, 'refreshing token');
	}

	if (!user) {
		logger.warn('Invalid refresh token subject');
		const error = errorInvalidTokenSubject();
		return rejectRequestFromMeetError(res, error);
	}

	// Restrict refresh if password change is required
	if (user.mustChangePassword) {
		logger.warn(`Cannot refresh token: password change required for user '${userId}'`);
		const error = errorPasswordChangeRequired();
		return rejectRequestFromMeetError(res, error);
	}

	try {
		const tokenRevocationService = container.get(UserTokenRevocationService);
		const shouldRotateRefreshToken = MEET_ENV.REFRESH_TOKEN_ROTATION_ENABLED.toLowerCase() === 'true';

		if (
			(await tokenRevocationService.isRevoked(user.userId, metadata)) ||
			(shouldRotateRefreshToken &&
				metadata.rid &&
				!(await tokenRevocationService.claimRefreshToken(metadata.rid)))
		) {
			logger.warn(`Refresh token of user '${userId}' was revoked or already exchanged`);
			return rejectRequestFromMeetError(res, errorInvalidRefreshToken());
		}

		const sid = metadata.sid ?? tokenService.createSessionId();
		const accessToken = await tokenService.generateAccessToken(user, sid);
		const newRefreshToken = shouldRotateRefreshToken
			? await tokenService.generateRefreshToken(user, sid)
			: undefined;

		logger.verbose(`Access token refreshed for user '${userId}'`);
		return res.status(200).json({
			message: `Access token for user '${userId}' successfully refreshed`,
			accessToken,
			...(newRefreshToken ? { refreshToken: newRefreshToken } : {})
		});
	} catch (error) {
		handleError(res, error, 'refreshing token');
	}
};
