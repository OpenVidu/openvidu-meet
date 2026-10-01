import { MEET_BROADCAST_FIELDS } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import {
	AddBroadcastDestinationReqSchema,
	BroadcastFieldsQuerySchema,
	StartBroadcastReqSchema,
	UpdateBroadcastDestinationReqSchema
} from '../../models/zod-schemas/broadcast.schema.js';
import { mergeFieldsHeaderIntoQuery } from '../../models/zod-schemas/field-selection.schema.js';

/**
 * Reads the fields a broadcast response is limited to, from the `fields` query parameter and the
 * `X-Fields` header together.
 */
export const validateBroadcastFieldsReq = (req: Request, res: Response, next: NextFunction) => {
	const query = req.query;
	mergeFieldsHeaderIntoQuery(req.headers, query, MEET_BROADCAST_FIELDS);

	const { success, error, data } = BroadcastFieldsQuerySchema.safeParse(query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	res.locals.validatedQuery = data;
	next();
};

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
