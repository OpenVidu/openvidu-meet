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
		.transform((val) => {
			let transformed = sanitizeId(val);

			if (transformed.startsWith('-')) transformed = transformed.substring(1);

			return transformed;
		})
		.refine((data) => data !== '', {
			message: `${fieldName} cannot be empty after sanitization`
		});

const validForceQueryParam = () =>
	z
		.preprocess((val) => {
			if (typeof val === 'string') {
				return val.toLowerCase() === 'true';
			}

			return val;
		}, z.boolean())
		.default(false);

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
	autoDeletionDate: z
		.number()
		.positive('autoDeletionDate must be a positive integer')
		.refine((date) => date >= Date.now() + 60 * 60 * 1000, 'autoDeletionDate must be at least 1 hour in the future')
		.optional(),
	roomIdPrefix: z
		.string()
		.transform((val) => {
			let transformed = val
				.trim() // Remove leading and trailing spaces
				.replace(/\s+/g, '') // Remove all whitespace instead of replacing it with hyphens
				.replace(/[^a-zA-Z0-9-]/g, '') // Remove any character except letters, numbers, and hyphens
				.replace(/-+/g, '-') // Replace multiple consecutive hyphens with a single one
				.replace(/-+$/, ''); // Remove trailing hyphens

			// If the transformed string starts with a hyphen, remove it.
			if (transformed.startsWith('-')) {
				transformed = transformed.substring(1);
			}

			return transformed;
		})
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
		.positive('maxItems must be a positive number')
		.transform((val) => {
			// Convert the value to a number
			const intVal = Math.floor(val);
			// Ensure it's not greater than 100
			return intVal > 100 ? 100 : intVal;
		})
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
		z.array(nonEmptySanitizedString('roomId')).default([])
	),
	force: validForceQueryParam()
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

export const withValidRoomId = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = nonEmptySanitizedString('roomId').safeParse(req.params.roomId);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.params.roomId = data;
	next();
};

export const withValidRoomBulkDeleteRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = BulkDeleteRoomsSchema.safeParse(req.query);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.query.roomIds = data.roomIds.join(',');
	req.query.force = data.force ? 'true' : 'false';
	next();
};

export const withValidRoomDeleteRequest = (req: Request, res: Response, next: NextFunction) => {
	const roomIdResult = nonEmptySanitizedString('roomId').safeParse(req.params.roomId);

	if (!roomIdResult.success) {
		return rejectRequest(res, roomIdResult.error);
	}

	req.params.roomId = roomIdResult.data;

	const forceResult = validForceQueryParam().safeParse(req.query.force);

	if (!forceResult.success) {
		return rejectRequest(res, forceResult.error);
	}

	req.query.force = forceResult.data ? 'true' : 'false';

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
		message: 'Invalid request',
		details: errors
	});
};
