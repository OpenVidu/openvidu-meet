import { MEET_BROADCAST_FIELDS } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import {
	BroadcastFieldsQuerySchema,
	BroadcastIdParamsSchema,
	BulkStopBroadcastsReqSchema,
	GetBroadcastsQuerySchema,
	StartBroadcastReqSchema
} from '../../models/zod-schemas/broadcast.schema.js';
import { mergeFieldsHeaderIntoQuery } from '../../models/zod-schemas/field-selection.schema.js';

/**
 * Reads the query of a broadcast request against the schema, with the fields asked for in the
 * `X-Fields` header merged into its `fields` parameter.
 */
const validateQuery =
	(schema: z.ZodType<Record<string, unknown>>) => (req: Request, res: Response, next: NextFunction) => {
		const query = req.query;
		mergeFieldsHeaderIntoQuery(req.headers, query, MEET_BROADCAST_FIELDS);

		const { success, error, data } = schema.safeParse(query);

		if (!success) {
			return rejectUnprocessableRequest(res, error);
		}

		res.locals.validatedQuery = data;
		next();
	};

const validateBody = (schema: z.ZodType) => (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = schema.safeParse(req.body ?? {});

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

/** Reads the fields a broadcast response is limited to. */
export const validateBroadcastFieldsReq = validateQuery(BroadcastFieldsQuerySchema);

/** Reads the room whose broadcasts are listed, and the fields of each. */
export const validateGetBroadcastsReq = validateQuery(GetBroadcastsQuerySchema);

export const validateStartBroadcastReq = validateBody(StartBroadcastReqSchema);

export const validateBulkStopBroadcastsReq = validateBody(BulkStopBroadcastsReqSchema);

export const validateBroadcastIdReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = BroadcastIdParamsSchema.safeParse(req.params);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.params.broadcastId = data.broadcastId;
	next();
};
