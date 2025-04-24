import { MeetRecordingFilters } from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { nonEmptySanitizedRoomId } from './room-validator.middleware.js';

const nonEmptySanitizedRecordingId = (fieldName: string) =>
	z
		.string()
		.min(1, { message: `${fieldName} is required and cannot be empty` })
		.transform((val) => {
			const sanitizedValue = val.trim();

			// Verify the format of the recording ID
			// The recording ID should be in the format 'roomId--EG_xxx--uid'
			const parts = sanitizedValue.split('--');

			// If the recording ID is not in the expected format, return the sanitized value
			// The next validation will check if the format is correct
			if (parts.length !== 3) return sanitizedValue;

			// If the recording ID is in the expected format, sanitize the roomId part
			const { success, data } = nonEmptySanitizedRoomId('roomId').safeParse(parts[0]);

			if (!success) {
				// If the roomId part is not valid, return the sanitized value
				return sanitizedValue;
			}

			return `${data}--${parts[1]}--${parts[2]}`;
		})
		.refine((data) => data !== '', {
			message: `${fieldName} cannot be empty after sanitization`
		})
		.refine(
			(data) => {
				const parts = data.split('--');

				if (parts.length !== 3) return false;

				if (parts[0].length === 0) return false;

				if (!parts[1].startsWith('EG_') || parts[1].length <= 3) return false;

				if (parts[2].length === 0) return false;

				return true;
			},
			{
				message: `${fieldName} does not follow the expected format`
			}
		);

const StartRecordingRequestSchema = z.object({
	roomId: nonEmptySanitizedRoomId('roomId')
});

const GetRecordingSchema = z.object({
	recordingId: nonEmptySanitizedRecordingId('recordingId')
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

			return [];
		},
		z
			.array(nonEmptySanitizedRecordingId('recordingId'))
			.nonempty({ message: 'recordingIds must contain at least one item' })
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
	fields: z.string().optional()
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
