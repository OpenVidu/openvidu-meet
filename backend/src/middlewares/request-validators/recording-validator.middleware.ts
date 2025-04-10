import { MeetRecordingFilters } from '@typings-ce';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const sanitizeId = (val: string): string => {
	return val
		.trim() // Remove leading and trailing spaces
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/[^a-zA-Z0-9_-]/g, ''); // Remove special characters (allow alphanumeric, hyphens and underscores)
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

const BulkDeleteRecordingsSchema = z.object({
	recordingIds: z.preprocess(
		(arg) => {
			if (typeof arg === 'string') {
				// If the argument is a string, it is expected to be a comma-separated list of recording IDs.
				return arg
					.split(',')
					.map((s) => s.trim())
					.filter((s) => s !== '');
			}

			return arg;
		},
		z.array(nonEmptySanitizedString('recordingId')).default([])
	)
});

const GetRecordingsFiltersSchema: z.ZodType<MeetRecordingFilters> = z.object({
	maxItems: z.coerce
		.number()
		.int()
		.optional()
		.transform((val = 10) => (val > 100 ? 100 : val))
		.default(10),
	// status: z.string().optional(),
	roomId: z.string().optional(),
	nextPageToken: z.string().optional(),
	fields: z.string().optional(),
});

export const withValidStartRecordingRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = StartRecordingRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.body = data;
	next();
};

export const withValidRecordingId = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRecordingSchema.safeParse({ recordingId: req.params.recordingId });

	if (!success) {
		return rejectRequest(res, error);
	}

	req.params.recordingId = data.recordingId;
	next();
};

export const withValidRecordingFiltersRequest = (req: Request, res: Response, next: NextFunction) => {
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

	req.query.recordingIds = data.recordingIds.join(',');
	next();
};

const rejectRequest = (res: Response, error: z.ZodError) => {
	const errors = error.errors.map((error) => ({
		field: error.path.join('.'),
		message: error.message
	}));

	return res.status(422).json({
		error: 'Unprocessable Entity',
		message: 'Invalid request',
		details: errors
	});
};
