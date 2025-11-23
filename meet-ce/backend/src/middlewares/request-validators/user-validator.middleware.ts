import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import { ChangePasswordReqSchema } from '../../models/zod-schemas/user.schema.js';

export const validateChangePasswordReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = ChangePasswordReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
