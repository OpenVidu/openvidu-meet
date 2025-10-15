import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { rejectUnprocessableRequest } from '../../models/error.model.js';

const ChangePasswordRequestSchema = z.object({
	currentPassword: z.string(),
	newPassword: z.string().min(5, 'New password must be at least 5 characters long')
});

export const validateChangePasswordRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = ChangePasswordRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
