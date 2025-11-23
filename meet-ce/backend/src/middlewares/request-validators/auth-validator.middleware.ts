import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import { LoginReqSchema } from '../../models/zod-schemas/auth.schema.js';

export const validateLoginReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = LoginReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
