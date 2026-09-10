import type { MeetWebhookOptions } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { handleError, rejectUnprocessableRequest } from '../../models/error.model.js';
import { MeetWebhookOptionsSchema } from '../../models/zod-schemas/webhook.schema.js';
import { assertWebhookDestinationAllowed } from '../../utils/webhook-destination.utils.js';

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

/**
 * Rejects a webhook whose URL points where webhooks may not be delivered, so the caller learns it
 * when registering instead of at every delivery.
 */
export const validateWebhookDestination = async (req: Request, res: Response, next: NextFunction) => {
	try {
		await assertWebhookDestinationAllowed((req.body as MeetWebhookOptions).url);
	} catch (error) {
		return handleError(res, error, 'validating webhook URL');
	}

	next();
};
