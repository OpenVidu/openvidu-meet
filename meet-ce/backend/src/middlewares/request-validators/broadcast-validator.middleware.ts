import type { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import {
	AddBroadcastDestinationReqSchema,
	StartBroadcastReqSchema,
	UpdateBroadcastDestinationReqSchema
} from '../../models/zod-schemas/broadcast.schema.js';

export const validateStartBroadcastReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = StartBroadcastReqSchema.safeParse(req.body ?? {});

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateAddBroadcastDestinationReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = AddBroadcastDestinationReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateUpdateBroadcastDestinationReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateBroadcastDestinationReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
