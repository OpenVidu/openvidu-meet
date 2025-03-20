import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const RecordingPostRequestSchema = z.object({
	roomId: z
		.string()
		.min(1, { message: 'roomId is required and cannot be empty' })
		.transform((val) => val.trim().replace(/\s+/g, '-'))
});

const getRecordingsSchema = z.object({
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

/**
 * Middleware to validate the recording post request.
 *
 * This middleware uses the `RecordingPostRequestSchema` to validate the request body.
 * If the validation fails, it rejects the request with an error response.
 * If the validation succeeds, it passes control to the next middleware or route handler.
 *
 */
export const withValidRecordingPostRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error } = RecordingPostRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectRequest(res, error);
	}

	next();
};

export const withValidGetRecordingsRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = getRecordingsSchema.safeParse(req.query);

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
	const { success, error } = z
		.array(z.string().min(1, { message: 'recordingIds must be a non-empty string' }))
		.safeParse(req.body);

	if (!success) {
		return rejectRequest(res, error);
	}

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
