import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

const LoginRequestSchema = z.object({
	username: z.string().min(4, 'Username must be at least 4 characters long'),
	password: z.string().min(4, 'Password must be at least 4 characters long')
});

export const validateLoginRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = LoginRequestSchema.safeParse(req.body);

	if (!success) {
		const errors = error.errors.map((error) => ({
			field: error.path.join('.'),
			message: error.message
		}));

		return res.status(422).json({
			error: 'Unprocessable Entity',
			message: 'Invalid request',
			details: errors
		});
	}

	req.body = data;
	next();
};
