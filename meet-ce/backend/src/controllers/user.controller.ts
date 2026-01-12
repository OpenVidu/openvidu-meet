import { MeetUserFilters, MeetUserOptions } from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import {
	errorUnauthorized,
	errorUserNotFound,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { TokenService } from '../services/token.service.js';
import { UserService } from '../services/user.service.js';
import { getBaseUrl } from '../utils/url.utils.js';

export const createUser = async (req: Request, res: Response) => {
	const userOptions = req.body as MeetUserOptions;

	const logger = container.get(LoggerService);
	logger.verbose(`Creating user with ID '${userOptions.userId}'`);

	try {
		const userService = container.get(UserService);
		const user = await userService.createUser(userOptions);
		res.set('Location', `${getBaseUrl()}${INTERNAL_CONFIG.API_BASE_PATH_V1}/users/${user.userId}`);
		return res.status(201).json(userService.convertToDTO(user));
	} catch (error) {
		handleError(res, error, 'creating user');
	}
};

export const getUsers = async (req: Request, res: Response) => {
	const queryParams = req.query as MeetUserFilters;

	const logger = container.get(LoggerService);
	logger.verbose(`Getting all users`);

	try {
		const userService = container.get(UserService);
		const { users, isTruncated, nextPageToken } = await userService.getUsers(queryParams);

		const usersDTO = users.map((user) => userService.convertToDTO(user));
		const maxItems = Number(queryParams.maxItems);

		return res.status(200).json({
			users: usersDTO,
			pagination: {
				isTruncated,
				nextPageToken,
				maxItems
			}
		});
	} catch (error) {
		handleError(res, error, 'getting users');
	}
};

export const getUser = async (req: Request, res: Response) => {
	const { userId } = req.params;

	const logger = container.get(LoggerService);
	logger.verbose(`Getting user with ID '${userId}'`);

	try {
		const userService = container.get(UserService);
		const user = await userService.getUser(userId);

		if (!user) {
			throw errorUserNotFound(userId);
		}

		return res.status(200).json(userService.convertToDTO(user));
	} catch (error) {
		handleError(res, error, 'getting user');
	}
};

export const deleteUser = async (req: Request, res: Response) => {
	const { userId } = req.params;

	const logger = container.get(LoggerService);
	logger.verbose(`Deleting user with ID '${userId}'`);

	try {
		const userService = container.get(UserService);
		await userService.deleteUser(userId);
		return res.status(200).json({ message: `User '${userId}' deleted successfully` });
	} catch (error) {
		handleError(res, error, 'deleting user');
	}
};

export const bulkDeleteUsers = async (req: Request, res: Response) => {
	const { userIds } = req.body as { userIds: string[] };

	const logger = container.get(LoggerService);
	logger.verbose(`Deleting users with IDs: ${userIds.join(', ')}`);

	try {
		const userService = container.get(UserService);
		const { deleted, failed } = await userService.bulkDeleteUsers(userIds);

		// All users were successfully deleted
		if (deleted.length > 0 && failed.length === 0) {
			return res.status(200).json({ message: 'All users deleted successfully', deleted });
		}

		// Some or all users could not be deleted
		return res.status(400).json({
			message: `${failed.length} user(s) could not be deleted`,
			deleted,
			failed
		});
	} catch (error) {
		handleError(res, error, 'deleting users');
	}
};

export const getMe = (_req: Request, res: Response) => {
	const requestSessionService = container.get(RequestSessionService);
	const user = requestSessionService.getAuthenticatedUser();

	if (!user) {
		const error = errorUnauthorized();
		return rejectRequestFromMeetError(res, error);
	}

	const userService = container.get(UserService);
	const userDTO = userService.convertToDTO(user);
	return res.status(200).json(userDTO);
};

export const changePassword = async (req: Request, res: Response) => {
	const requestSessionService = container.get(RequestSessionService);
	const user = requestSessionService.getAuthenticatedUser();

	if (!user) {
		const error = errorUnauthorized();
		return rejectRequestFromMeetError(res, error);
	}

	const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

	const logger = container.get(LoggerService);
	logger.verbose(`Changing password for user '${user.userId}'`);

	try {
		const userService = container.get(UserService);
		await userService.changePassword(user.userId, currentPassword, newPassword);

		const message = `Password for user '${user.userId}' changed successfully`;
		logger.info(message);

		// Generate new tokens if the user had to change password
		if (user.mustChangePassword) {
			logger.info(`Generating new tokens for user '${user.userId}' after password change`);
			const tokenService = container.get(TokenService);
			const accessToken = await tokenService.generateAccessToken(user);
			const refreshToken = await tokenService.generateRefreshToken(user);

			return res.status(200).json({
				message,
				accessToken,
				refreshToken
			});
		}

		return res.status(200).json({ message });
	} catch (error) {
		handleError(res, error, 'changing password');
	}
};
