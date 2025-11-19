import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import { LoginRequestSchema } from '../../models/zod-schemas/index.js';

export const validateLoginRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = LoginRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
