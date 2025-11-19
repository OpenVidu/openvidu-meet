import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import {
	RoomsAppearanceConfigSchema,
	SecurityConfigSchema,
	WebhookConfigSchema,
	WebhookTestSchema
} from '../../models/zod-schemas/index.js';

export const validateWebhookConfig = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = WebhookConfigSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const withValidWebhookTestRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = WebhookTestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateSecurityConfig = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = SecurityConfigSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateRoomsAppearanceConfig = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomsAppearanceConfigSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
