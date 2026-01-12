import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import {
	BulkDeleteUsersReqSchema,
	ChangePasswordReqSchema,
	ResetUserPasswordReqSchema,
	UserFiltersSchema,
	UserOptionsSchema
} from '../../models/zod-schemas/user.schema.js';

export const validateCreateUserReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UserOptionsSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateGetUsersReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UserFiltersSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query = {
		...data,
		maxItems: data.maxItems?.toString()
	};
	next();
};

export const validateBulkDeleteUsersReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = BulkDeleteUsersReqSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query = data;
	next();
};

export const validateChangePasswordReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = ChangePasswordReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateResetUserPasswordReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = ResetUserPasswordReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
