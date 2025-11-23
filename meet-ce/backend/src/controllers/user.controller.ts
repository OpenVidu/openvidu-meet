import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { errorUnauthorized, handleError, rejectRequestFromMeetError } from '../models/error.model.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { UserService } from '../services/user.service.js';

export const getProfile = (_req: Request, res: Response) => {
	const requestSessionService = container.get(RequestSessionService);
	const user = requestSessionService.getUser();

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
	const user = requestSessionService.getUser();

	if (!user) {
		const error = errorUnauthorized();
		return rejectRequestFromMeetError(res, error);
	}

	const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

	try {
		const userService = container.get(UserService);
		await userService.changePassword(user.username, currentPassword, newPassword);
		return res.status(200).json({ message: `Password for user '${user.username}' changed successfully` });
	} catch (error) {
		handleError(res, error, 'changing password');
	}
};
