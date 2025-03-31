import { container } from '../config/dependency-injector.config.js';
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { TokenService } from '../services/token.service.js';
import { LoggerService } from '../services/logger.service.js';
import {
	ACCESS_TOKEN_COOKIE_NAME,
	MEET_ACCESS_TOKEN_EXPIRATION,
	MEET_INTERNAL_API_BASE_PATH_V1,
	MEET_REFRESH_TOKEN_EXPIRATION,
	REFRESH_TOKEN_COOKIE_NAME
} from '../environment.js';
import { ClaimGrants } from 'livekit-server-sdk';
import { getCookieOptions } from '../utils/cookie-utils.js';
import { UserService } from '../services/user.service.js';

export const login = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Login request received');
	const { username, password } = req.body as { username: string; password: string };

	const authService = container.get(AuthService);
	const user = await authService.authenticate(username, password);

	if (!user) {
		logger.warn('Login failed');
		return res.status(404).json({ message: 'Login failed. Invalid username or password' });
	}

	try {
		const tokenService = container.get(TokenService);
		const accessToken = await tokenService.generateAccessToken(user);
		const refreshToken = await tokenService.generateRefreshToken(user);
		res.cookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, getCookieOptions('/', MEET_ACCESS_TOKEN_EXPIRATION));
		res.cookie(
			REFRESH_TOKEN_COOKIE_NAME,
			refreshToken,
			getCookieOptions(`${MEET_INTERNAL_API_BASE_PATH_V1}/auth`, MEET_REFRESH_TOKEN_EXPIRATION)
		);
		logger.info(`Login succeeded for user ${username}`);
		return res.status(200).json({ message: 'Login succeeded' });
	} catch (error) {
		logger.error('Error generating token' + error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

export const logout = (_req: Request, res: Response) => {
	res.clearCookie(ACCESS_TOKEN_COOKIE_NAME);
	res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
		path: `${MEET_INTERNAL_API_BASE_PATH_V1}/auth`
	});
	return res.status(200).json({ message: 'Logout successful' });
};

export const refreshToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Refresh token request received');
	const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE_NAME];

	if (!refreshToken) {
		logger.warn('No refresh token provided');
		return res.status(400).json({ message: 'No refresh token provided' });
	}

	const tokenService = container.get(TokenService);
	let payload: ClaimGrants;

	try {
		payload = await tokenService.verifyToken(refreshToken);
	} catch (error) {
		logger.error('Error verifying refresh token' + error);
		return res.status(400).json({ message: 'Invalid refresh token' });
	}

	const username = payload.sub;
	const userService = container.get(UserService);
	const user = username ? await userService.getUser(username) : null;

	if (!user) {
		logger.warn('Invalid refresh token subject');
		return res.status(403).json({ message: 'Invalid refresh token subject' });
	}

	try {
		const accessToken = await tokenService.generateAccessToken(user);
		res.cookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, getCookieOptions('/', MEET_ACCESS_TOKEN_EXPIRATION));
		logger.info(`Token refreshed for user ${username}`);
		return res.status(200).json({ message: 'Token refreshed' });
	} catch (error) {
		logger.error('Error refreshing token' + error);
		return res.status(500).json({ message: 'Internal server error' });
	}
};

export const getProfile = (req: Request, res: Response) => {
	const user = req.session?.user;

	if (!user) {
		return res.status(401).json({ message: 'Unauthorized' });
	}

	return res.status(200).json(user);
};
