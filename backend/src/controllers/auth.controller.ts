import { Request, Response } from 'express';
import { ClaimGrants } from 'livekit-server-sdk';
import { container } from '../config/index.js';
import INTERNAL_CONFIG from '../config/internal-config.js';
import {
	errorInvalidCredentials,
	errorInvalidRefreshToken,
	errorInvalidTokenSubject,
	errorRefreshTokenNotPresent,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { AuthService, LoggerService, TokenService, UserService } from '../services/index.js';
import { getCookieOptions } from '../utils/cookie-utils.js';

export const login = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Login request received');
	const { username, password } = req.body as { username: string; password: string };

	const authService = container.get(AuthService);
	const user = await authService.authenticateUser(username, password);

	if (!user) {
		logger.warn('Login failed');
		const error = errorInvalidCredentials();
		return rejectRequestFromMeetError(res, error);
	}

	try {
		const tokenService = container.get(TokenService);
		const accessToken = await tokenService.generateAccessToken(user);
		const refreshToken = await tokenService.generateRefreshToken(user);
		res.cookie(
			INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME,
			accessToken,
			getCookieOptions('/', INTERNAL_CONFIG.ACCESS_TOKEN_EXPIRATION)
		);
		res.cookie(
			INTERNAL_CONFIG.REFRESH_TOKEN_COOKIE_NAME,
			refreshToken,
			getCookieOptions(
				`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`,
				INTERNAL_CONFIG.REFRESH_TOKEN_EXPIRATION
			)
		);
		logger.info(`Login succeeded for user '${username}'`);
		return res.status(200).json({ message: `User '${username}' logged in successfully` });
	} catch (error) {
		handleError(res, error, 'generating token');
	}
};

export const logout = (_req: Request, res: Response) => {
	res.clearCookie(INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME);
	res.clearCookie(INTERNAL_CONFIG.REFRESH_TOKEN_COOKIE_NAME, {
		path: `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`
	});
	return res.status(200).json({ message: 'Logout successful' });
};

export const refreshToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Refresh token request received');
	const refreshToken = req.cookies[INTERNAL_CONFIG.REFRESH_TOKEN_COOKIE_NAME];

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
		res.cookie(
			INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME,
			accessToken,
			getCookieOptions('/', INTERNAL_CONFIG.ACCESS_TOKEN_EXPIRATION)
		);
		logger.info(`Access token refreshed for user '${username}'`);
		return res.status(200).json({ message: `Access token for user '${username}' successfully refreshed` });
	} catch (error) {
		handleError(res, error, 'refreshing token');
	}
};

export const createApiKey = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Create API key request received');

	const authService = container.get(AuthService);

	try {
		const apiKey = await authService.createApiKey();
		return res.status(201).json(apiKey);
	} catch (error) {
		handleError(res, error, 'creating API key');
	}
};

export const getApiKeys = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Get API keys request received');

	const authService = container.get(AuthService);

	try {
		const apiKeys = await authService.getApiKeys();
		return res.status(200).json(apiKeys);
	} catch (error) {
		handleError(res, error, 'getting API keys');
	}
};

export const deleteApiKeys = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Delete API keys request received');

	const authService = container.get(AuthService);

	try {
		await authService.deleteApiKeys();
		return res.status(200).json({ message: 'API keys deleted successfully' });
	} catch (error) {
		handleError(res, error, 'deleting API keys');
	}
};
