import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { rejectUnprocessableRequest } from '../../models/error.model.js';

const LoginRequestSchema = z.object({
	username: z.string().min(4, 'Username must be at least 4 characters long'),
	password: z.string().min(4, 'Password must be at least 4 characters long')
});

export const validateLoginRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = LoginRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
