import type { NextFunction, Request, Response } from 'express';
import { RoomsAppearanceConfigSchema, SecurityConfigSchema } from '../../models/zod-schemas/global-config.schema.js';
import { rejectUnprocessableRequest } from '../error-handler.middleware.js';

export const validateUpdateSecurityConfigReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = SecurityConfigSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateUpdateRoomsAppearanceConfigReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomsAppearanceConfigSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
