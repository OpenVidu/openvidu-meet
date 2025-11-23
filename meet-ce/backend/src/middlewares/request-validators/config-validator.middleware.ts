import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import {
	RoomsAppearanceConfigSchema,
	SecurityConfigSchema,
	WebhookConfigSchema,
	TestWebhookReqSchema
} from '../../models/zod-schemas/global-config.schema.js';

export const validateUpdateWebhookConfigReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = WebhookConfigSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateTestWebhookReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = TestWebhookReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

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
