import { Request, Response } from 'express';
import { ClaimGrants } from 'livekit-server-sdk';
import { container } from '../config/dependency-injector.config.js';
import {
	errorInvalidCredentials,
	errorInvalidRefreshToken,
	errorInvalidTokenSubject,
	errorRefreshTokenNotPresent,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
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

	// Get refresh token from cookie or header based on transport mode
	const refreshToken = await getRefreshToken(req);

	if (!refreshToken) {
		logger.warn('No refresh token provided');
		const error = errorRefreshTokenNotPresent();
		return rejectRequestFromMeetError(res, error);
	}

	const tokenService = container.get(TokenService);
	let payload: ClaimGrants;

	try {
		payload = await tokenService.verifyToken(refreshToken);
	} catch (error) {
		logger.error('Error verifying refresh token:', error);
		const meetError = errorInvalidRefreshToken();
		return rejectRequestFromMeetError(res, meetError);
	}

	const username = payload.sub;
	const userService = container.get(UserService);
	const user = username ? await userService.getUser(username) : null;

	if (!user) {
		logger.warn('Invalid refresh token subject');
		const error = errorInvalidTokenSubject();
		return rejectRequestFromMeetError(res, error);
	}

	try {
		const accessToken = await tokenService.generateAccessToken(user);

		logger.info(`Access token refreshed for user '${username}'`);
		return res.status(200).json({
			message: `Access token for user '${username}' successfully refreshed`,
			accessToken
		});
	} catch (error) {
		handleError(res, error, 'refreshing token');
	}
};
