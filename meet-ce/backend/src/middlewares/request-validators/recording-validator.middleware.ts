import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import {
	GetRecordingMediaSchema,
	GetRecordingSchema,
	GetRecordingsFiltersSchema,
	GetRecordingUrlSchema,
	MultipleRecordingIdsSchema,
	nonEmptySanitizedRecordingId,
	StartRecordingRequestSchema
} from '../../models/zod-schemas/index.js';

export const withValidStartRecordingRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = StartRecordingRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
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

export const withValidGetRecordingRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRecordingSchema.safeParse({
		params: req.params,
		query: req.query
	});

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.params.recordingId = data.params.recordingId;
	next();
};

export const withValidRecordingFiltersRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRecordingsFiltersSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query = {
		...data,
		maxItems: data.maxItems?.toString()
	};
	next();
};

export const withValidMultipleRecordingIds = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = MultipleRecordingIdsSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query.recordingIds = data.recordingIds.join(',');
	next();
};

export const withValidGetRecordingMediaRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRecordingMediaSchema.safeParse({
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

export const withValidGetRecordingUrlRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRecordingUrlSchema.safeParse({
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
