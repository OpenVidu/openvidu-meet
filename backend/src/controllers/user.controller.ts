import { Request, Response } from 'express';
import { container } from '../config/index.js';
import { errorUnauthorized, handleError, rejectRequestFromMeetError } from '../models/error.model.js';
import { UserService } from '../services/index.js';

export const getProfile = (req: Request, res: Response) => {
	const user = req.session?.user;

	if (!user) {
		const error = errorUnauthorized();
		return rejectRequestFromMeetError(res, error);
	}

	const userService = container.get(UserService);
	const userDTO = userService.convertToDTO(user);
	return res.status(200).json(userDTO);
};

export const changePassword = async (req: Request, res: Response) => {
	const user = req.session?.user;

	if (!user) {
		const error = errorUnauthorized();
		return rejectRequestFromMeetError(res, error);
	}

	const { newPassword } = req.body as { newPassword: string };

	try {
		const userService = container.get(UserService);
		await userService.changePassword(user.username, newPassword);
		return res.status(200).json({ message: 'Password changed successfully' });
	} catch (error) {
		handleError(res, error, 'changing password');
	}
};
