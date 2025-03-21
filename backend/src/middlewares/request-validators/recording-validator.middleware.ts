import { MeetRecordingFilters } from '@typings-ce';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const sanitizeId = (val: string): string => {
	return val
		.trim() // Remove leading and trailing spaces
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/[^a-zA-Z0-9-]/g, ''); // Remove special characters (only allow alphanumeric and hyphens)
};

const nonEmptySanitizedString = (fieldName: string) =>
	z
		.string()
		.min(1, { message: `${fieldName} is required and cannot be empty` })
		.transform(sanitizeId)
		.refine((data) => data !== '', {
			message: `${fieldName} cannot be empty after sanitization`
		});

const StartRecordingRequestSchema = z.object({
	roomId: nonEmptySanitizedString('roomId')
});

const GetRecordingSchema = z.object({
	recordingId: nonEmptySanitizedString('recordingId')
});

export const BulkDeleteRecordingsSchema = z.object({
	recordingIds: z.preprocess(
		(arg) => {
			if (typeof arg === 'string') {
				// Si se recibe un string con valores separados por comas,
				// se divide en array, eliminando espacios en blanco y valores vacíos.
				return arg
					.split(',')
					.map((s) => s.trim())
					.filter((s) => s !== '');
			}

			return arg;
		},
		z.array(nonEmptySanitizedString('recordingId'))
	)
});

const GetRecordingsFiltersSchema:  z.ZodType<MeetRecordingFilters> = z.object({
	maxItems: z.coerce
		.number()
		.int()
		.optional()
		.transform((val = 10) => (val > 100 ? 100 : val))
		.default(10),
	status: z.string().optional(),
	roomId: z.string().optional(),
	nextPageToken: z.string().optional()
});

export const withValidStartRecordingRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = StartRecordingRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.body = data;

	next();
};

export const withValidRecordingIdRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRecordingSchema.safeParse(req.params.recordingId);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.params.recordingId = data.recordingId;

	next();
};

export const withValidGetRecordingsRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRecordingsFiltersSchema.safeParse(req.query);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.query = {
		...data,
		maxItems: data.maxItems?.toString()
	};
	next();
};

export const withValidRecordingBulkDeleteRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = BulkDeleteRecordingsSchema.safeParse(req.query);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.query.recordingIds = data.recordingIds;

	next();
};

const rejectRequest = (res: Response, error: z.ZodError) => {
	const errors = error.errors.map((error) => ({
		field: error.path.join('.'),
		message: error.message
	}));

	console.log(errors);

	return res.status(422).json({
		error: 'Unprocessable Entity',
		message: 'Invalid request body',
		details: errors
	});
};
