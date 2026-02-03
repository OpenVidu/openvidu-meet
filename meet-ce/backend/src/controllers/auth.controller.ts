import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import {
	errorInvalidCredentials,
	errorInvalidRefreshToken,
	errorInvalidTokenSubject,
	errorPasswordChangeRequired,
	errorRefreshTokenNotPresent,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { TokenType } from '../models/token.model.js';
import { LoggerService } from '../services/logger.service.js';
import { TokenService } from '../services/token.service.js';
import { UserService } from '../services/user.service.js';
import { getRefreshToken } from '../utils/token.utils.js';

export const login = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Login request received');
	const { userId, password } = req.body as { userId: string; password: string };

	const userService = container.get(UserService);
	const user = await userService.authenticateUser(userId, password);

	if (!user) {
		logger.warn('Login failed');
		const error = errorInvalidCredentials();
		return rejectRequestFromMeetError(res, error);
	}

	try {
		const tokenService = container.get(TokenService);

		// Check if password change is required
		if (user.mustChangePassword) {
			// Generate temporary token with limited TTL, no refresh token
			const accessToken = await tokenService.generateAccessToken(user, true);

			logger.info(`Login succeeded for user '${userId}', but password change is required`);
			return res.status(200).json({
				message: `User '${userId}' logged in successfully, but password change is required`,
				accessToken,
				mustChangePassword: true
			});
		}

		// Normal login flow
		const accessToken = await tokenService.generateAccessToken(user);
		const refreshToken = await tokenService.generateRefreshToken(user);

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

export const logout = async (_req: Request, res: Response) => {
	// The client is responsible for clearing tokens from localStorage,
	// so just respond with success
	return res.status(200).json({ message: 'Logout successful' });
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

	try {
		// Verify the token and extract the user ID and token metadata
		const { sub, metadata: tokenMetadata } = await tokenService.verifyToken(refreshToken);

		if (!tokenMetadata) {
			throw new Error('Missing required token claims');
		}

		// Validate that this is actually a refresh token
		const parsedMetadata = tokenService.parseTokenMetadata(tokenMetadata);
		userId = sub;
		const tokenType = parsedMetadata.tokenType;

		if (tokenType !== TokenType.REFRESH) {
			throw new Error('Invalid token type for refresh operation');
		}
	} catch (error) {
		logger.error('Invalid refresh token:', error);
		const meetError = errorInvalidRefreshToken();
		return rejectRequestFromMeetError(res, meetError);
	}

	const userService = container.get(UserService);
	const user = userId ? await userService.getUser(userId) : null;

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
		const accessToken = await tokenService.generateAccessToken(user);

		logger.info(`Access token refreshed for user '${userId}'`);
		return res.status(200).json({
			message: `Access token for user '${userId}' successfully refreshed`,
			accessToken
		});
	} catch (error) {
		handleError(res, error, 'refreshing token');
	}
};
