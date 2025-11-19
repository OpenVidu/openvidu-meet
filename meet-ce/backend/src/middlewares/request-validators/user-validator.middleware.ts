import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import { ChangePasswordRequestSchema } from '../../models/zod-schemas/index.js';

export const validateChangePasswordRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = ChangePasswordRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
