import type { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import { MeetWebhookOptionsSchema } from '../../models/zod-schemas/webhook.schema.js';

/**
 * Validates the body of webhook create and update requests (both carry {@link MeetWebhookOptions}).
 */
export const validateWebhookOptionsReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = MeetWebhookOptionsSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
