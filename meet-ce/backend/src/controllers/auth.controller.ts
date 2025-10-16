import { AuthTransportMode } from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import { ClaimGrants } from 'livekit-server-sdk';
import { container } from '../config/index.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import {
	errorInvalidCredentials,
	errorInvalidRefreshToken,
	errorInvalidTokenSubject,
	errorRefreshTokenNotPresent,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { AuthService, LoggerService, TokenService, UserService } from '../services/index.js';
import { getAuthTransportMode, getCookieOptions, getRefreshToken } from '../utils/index.js';

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

		logger.info(`Login succeeded for user '${username}'`);
		const transportMode = await getAuthTransportMode();

		if (transportMode === AuthTransportMode.HEADER) {
			// Send tokens in response body for header mode
			return res.status(200).json({
				message: `User '${username}' logged in successfully`,
				accessToken,
				refreshToken
			});
		} else {
			// Send tokens as cookies for cookie mode
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
			return res.status(200).json({ message: `User '${username}' logged in successfully` });
		}
	} catch (error) {
		handleError(res, error, 'generating access and refresh tokens');
	}
};

export const logout = async (_req: Request, res: Response) => {
	const transportMode = await getAuthTransportMode();

	if (transportMode === AuthTransportMode.COOKIE) {
		// Clear cookies only in cookie mode
		res.clearCookie(INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME);
		res.clearCookie(INTERNAL_CONFIG.REFRESH_TOKEN_COOKIE_NAME, {
			path: `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`
		});
	}

	// In header mode, the client is responsible for clearing localStorage
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
		const transportMode = await getAuthTransportMode();

		if (transportMode === AuthTransportMode.HEADER) {
			// Send access token in response body for header mode
			return res.status(200).json({
				message: `Access token for user '${username}' successfully refreshed`,
				accessToken
			});
		} else {
			// Send access token as cookie for cookie mode
			res.cookie(
				INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME,
				accessToken,
				getCookieOptions('/', INTERNAL_CONFIG.ACCESS_TOKEN_EXPIRATION)
			);
			return res.status(200).json({ message: `Access token for user '${username}' successfully refreshed` });
		}
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
