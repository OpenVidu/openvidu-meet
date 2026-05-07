import type { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import {
	BulkDeleteRecordingsReqSchema,
	GetRecordingMediaReqSchema,
	GetRecordingReqSchema,
	GetRecordingUrlReqSchema,
	mergeRecordingHeaderFieldsIntoQuery,
	nonEmptySanitizedRecordingId,
	RecordingFiltersSchema,
	RecordingQueryFieldsSchema,
	StartRecordingReqSchema,
	StopRecordingReqSchema
} from '../../models/zod-schemas/recording.schema.js';

export const validateStartRecordingReq = (req: Request, res: Response, next: NextFunction) => {
	// Merge X-Fields header into query params before validation
	const query = req.query;
	mergeRecordingHeaderFieldsIntoQuery(req.headers, query);

	const bodyResult = StartRecordingReqSchema.safeParse(req.body);

	if (!bodyResult.success) {
		return rejectUnprocessableRequest(res, bodyResult.error);
	}

	req.body = bodyResult.data;

	const queryResult = RecordingQueryFieldsSchema.safeParse(query);

	if (!queryResult.success) {
		return rejectUnprocessableRequest(res, queryResult.error);
	}

	res.locals.validatedQuery = queryResult.data;
	next();
};

export const validateGetRecordingsReq = (req: Request, res: Response, next: NextFunction) => {
	// Merge X-Fields header into query params before validation
	const query = req.query;
	mergeRecordingHeaderFieldsIntoQuery(req.headers, query);

	const { success, error, data } = RecordingFiltersSchema.safeParse(query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	res.locals.validatedQuery = {
		...data,
		maxItems: data.maxItems?.toString()
	};
	next();
};

export const validateBulkDeleteRecordingsReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = BulkDeleteRecordingsReqSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	res.locals.validatedQuery = data;
	next();
};

export const withValidRecordingId = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = nonEmptySanitizedRecordingId('recordingId').safeParse(req.params.recordingId);

	if (!success) {
		error.errors[0].path = ['recordingId'];
		return rejectUnprocessableRequest(res, error);
	}

	req.params.recordingId = data;
	next();
};

export const validateGetRecordingReq = (req: Request, res: Response, next: NextFunction) => {
	// Merge X-Fields header into query params before validation
	const query = req.query;
	mergeRecordingHeaderFieldsIntoQuery(req.headers, query);

	const { success, error, data } = GetRecordingReqSchema.safeParse({
		params: req.params,
		query
	});

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.params.recordingId = data.params.recordingId;
	res.locals.validatedQuery = data.query;
	next();
};

export const validateStopRecordingReq = (req: Request, res: Response, next: NextFunction) => {
	// Merge X-Fields header into query params before validation
	const query = req.query;
	mergeRecordingHeaderFieldsIntoQuery(req.headers, query);

	const { success, error, data } = StopRecordingReqSchema.safeParse({
		params: req.params,
		query
	});

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.params.recordingId = data.params.recordingId;
	res.locals.validatedQuery = data.query;
	next();
};

export const validateGetRecordingMediaReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRecordingMediaReqSchema.safeParse({
		params: req.params,
		query: req.query,
		headers: req.headers
	});

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.params.recordingId = data.params.recordingId;
	req.query.recordingSecret = data.query.recordingSecret;
	req.headers.range = data.headers.range;
	next();
};

export const validateGetRecordingUrlReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRecordingUrlReqSchema.safeParse({
		params: req.params,
		query: req.query
	});

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.params.recordingId = data.params.recordingId;
	res.locals.validatedQuery = { privateAccess: data.query.privateAccess };
	next();
};
