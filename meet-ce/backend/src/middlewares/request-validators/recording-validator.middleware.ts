import { NextFunction, Request, Response } from 'express';
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
	mergeRecordingHeaderFieldsIntoQuery(req.headers, req.query);

	const bodyResult = StartRecordingReqSchema.safeParse(req.body);

	if (!bodyResult.success) {
		return rejectUnprocessableRequest(res, bodyResult.error);
	}

	req.body = bodyResult.data;

	const queryResult = RecordingQueryFieldsSchema.safeParse(req.query);

	if (!queryResult.success) {
		return rejectUnprocessableRequest(res, queryResult.error);
	}

	req.query = queryResult.data;
	next();
};

export const validateGetRecordingsReq = (req: Request, res: Response, next: NextFunction) => {
	// Merge X-Fields header into query params before validation
	mergeRecordingHeaderFieldsIntoQuery(req.headers, req.query);

	const { success, error, data } = RecordingFiltersSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query = {
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

	req.query = data;
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
	mergeRecordingHeaderFieldsIntoQuery(req.headers, req.query);

	const { success, error, data } = GetRecordingReqSchema.safeParse({
		params: req.params,
		query: req.query
	});

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.params.recordingId = data.params.recordingId;
	req.query = data.query;
	next();
};

export const validateStopRecordingReq = (req: Request, res: Response, next: NextFunction) => {
	// Merge X-Fields header into query params before validation
	mergeRecordingHeaderFieldsIntoQuery(req.headers, req.query);

	const { success, error, data } = StopRecordingReqSchema.safeParse({
		params: req.params,
		query: req.query
	});

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.params.recordingId = data.params.recordingId;
	req.query = data.query;
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
	req.query.secret = data.query.secret;
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
	req.query.privateAccess = data.query.privateAccess ? 'true' : 'false';
	next();
};
