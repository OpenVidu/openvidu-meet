import {
	MeetChatPreferences,
	MeetRoomOptions,
	MeetRecordingPreferences,
	MeetRoomPreferences,
	MeetVirtualBackgroundPreferences,
	MeetRoomFilters
} from '@typings-ce';
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

const RecordingPreferencesSchema: z.ZodType<MeetRecordingPreferences> = z.object({
	enabled: z.boolean()
});

const ChatPreferencesSchema: z.ZodType<MeetChatPreferences> = z.object({
	enabled: z.boolean()
});

const VirtualBackgroundPreferencesSchema: z.ZodType<MeetVirtualBackgroundPreferences> = z.object({
	enabled: z.boolean()
});

const RoomPreferencesSchema: z.ZodType<MeetRoomPreferences> = z.object({
	recordingPreferences: RecordingPreferencesSchema,
	chatPreferences: ChatPreferencesSchema,
	virtualBackgroundPreferences: VirtualBackgroundPreferencesSchema
});

const RoomRequestOptionsSchema: z.ZodType<MeetRoomOptions> = z.object({
	expirationDate: z
		.number()
		.positive('Expiration date must be a positive integer')
		.min(Date.now(), 'Expiration date must be in the future'),
	roomIdPrefix: z
		.string()
		.transform(
			(val) =>
				val
					.trim() // Remove leading and trailing spaces
					.replace(/\s+/g, '') // Remove all whitespace instead of replacing it with hyphens
					.replace(/[^a-zA-Z0-9-]/g, '') // Remove any character except letters, numbers, and hyphens
					.replace(/-+/g, '-') // Replace multiple consecutive hyphens with a single one
					.replace(/-+$/, '') // Remove trailing hyphens
		)
		.optional()
		.default(''),
	preferences: RoomPreferencesSchema.optional().default({
		recordingPreferences: { enabled: true },
		chatPreferences: { enabled: true },
		virtualBackgroundPreferences: { enabled: true }
	})
	// maxParticipants: z
	// 	.number()
	// 	.positive('Max participants must be a positive integer')
	// 	.nullable()
	// 	.optional()
	// 	.default(null)
});

const GetParticipantRoleSchema = z.object({
	secret: z.string()
});

const GetRoomFiltersSchema: z.ZodType<MeetRoomFilters> = z.object({
	maxItems: z.coerce
		.number()
		.int()
		.transform((val) => (val > 100 ? 100 : val))
		.default(10),
	nextPageToken: z.string().optional(),
	fields: z.string().optional()
});

const BulkDeleteRoomsSchema = z.object({
	roomIds: z.preprocess(
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

export const withValidRoomOptions = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomRequestOptionsSchema.safeParse(req.body);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.body = data;
	next();
};

export const withValidRoomFiltersRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRoomFiltersSchema.safeParse(req.query);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.query = {
		...data,
		maxItems: data.maxItems?.toString()
	};

	next();
};

export const withValidRoomPreferences = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomPreferencesSchema.safeParse(req.body);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.body = data;
	next();
};

export const withValidRoomBulkDeleteRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = BulkDeleteRoomsSchema.safeParse(req.query);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.query.roomIds = data.roomIds.join(',');
	next();
};

export const validateGetParticipantRoleRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetParticipantRoleSchema.safeParse(req.query);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.query = data;
	next();
};

const rejectRequest = (res: Response, error: z.ZodError) => {
	const errors = error.errors.map((error) => ({
		field: error.path.join('.'),
		message: error.message
	}));

	return res.status(422).json({
		error: 'Unprocessable Entity',
		message: 'Invalid request body',
		details: errors
	});
};
