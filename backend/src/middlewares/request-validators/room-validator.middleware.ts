import {
	MeetChatPreferences,
	MeetRecordingAccess,
	MeetRecordingPreferences,
	MeetRoomFilters,
	MeetRoomOptions,
	MeetRoomPreferences,
	MeetVirtualBackgroundPreferences
} from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import ms from 'ms';
import { z } from 'zod';
import INTERNAL_CONFIG from '../../config/internal-config.js';

/**
 * Sanitizes an identifier by removing/replacing invalid characters
 * and normalizing format.
 *
 * @param val The string to sanitize
 * @returns A sanitized string safe for use as an identifier
 */
const sanitizeRoomId = (val: string): string => {
	let transformed = val
		.trim() // Remove leading/trailing spaces
		.replace(/\s+/g, '') // Remove all spaces
		.replace(/[^a-zA-Z0-9_-]/g, '') // Allow alphanumeric, underscores and hyphens
		.replace(/-+/g, '-') // Replace multiple consecutive hyphens
		.replace(/-+$/, ''); // Remove trailing hyphens

	// Remove leading hyphens
	if (transformed.startsWith('-')) {
		transformed = transformed.substring(1);
	}

	return transformed;
};

export const nonEmptySanitizedRoomId = (fieldName: string) =>
	z
		.string()
		.min(1, { message: `${fieldName} is required and cannot be empty` })
		.max(100, { message: `${fieldName} cannot exceed 100 characters` })
		.transform(sanitizeRoomId)
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

const RecordingAccessSchema: z.ZodType<MeetRecordingAccess> = z.enum([
	MeetRecordingAccess.ADMIN,
	MeetRecordingAccess.ADMIN_MODERATOR,
	MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER,
	MeetRecordingAccess.PUBLIC
]);

const RecordingPreferencesSchema: z.ZodType<MeetRecordingPreferences> = z.object({
	enabled: z.boolean(),
	allowAccessTo: RecordingAccessSchema
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
		.refine(
			(date) => date >= Date.now() + ms(INTERNAL_CONFIG.MIN_FUTURE_TIME_FOR_ROOM_AUTODELETION_DATE),
			`autoDeletionDate must be at least ${INTERNAL_CONFIG.MIN_FUTURE_TIME_FOR_ROOM_AUTODELETION_DATE} in the future`
		)
		.optional(),
	roomIdPrefix: z
		.string()
		.max(50, 'roomIdPrefix cannot exceed 50 characters')
		.transform(sanitizeRoomId)
		.optional()
		.default(''),
	preferences: RoomPreferencesSchema.optional().default({
		recordingPreferences: { enabled: true, allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER },
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
			// First, convert input to array of strings
			let roomIds: string[] = [];

			if (typeof arg === 'string') {
				roomIds = arg
					.split(',')
					.map((s) => s.trim())
					.filter((s) => s !== '');
			} else if (Array.isArray(arg)) {
				roomIds = arg.map((item) => String(item)).filter((s) => s !== '');
			}

			// Apply sanitization BEFORE validation and deduplicate
			// This prevents identical IDs from being processed separately
			const sanitizedIds = new Set();

			// Pre-sanitize to check for duplicates that would become identical
			for (const id of roomIds) {
				const transformed = sanitizeRoomId(id);

				// Only add non-empty IDs
				if (transformed !== '') {
					sanitizedIds.add(transformed);
				}
			}

			return Array.from(sanitizedIds);
		},
		z.array(z.string()).min(1, {
			message: 'At least one valid roomId is required after sanitization'
		})
	),
	force: validForceQueryParam()
});

const RecordingTokenRequestSchema = z.object({
	secret: z.string().nonempty('Secret is required')
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
	const { success, error, data } = nonEmptySanitizedRoomId('roomId').safeParse(req.params.roomId);

	if (!success) {
		error.errors[0].path = ['roomId'];
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

	req.query.roomIds = data.roomIds as any;
	req.query.force = data.force ? 'true' : 'false';
	next();
};

export const withValidRoomDeleteRequest = (req: Request, res: Response, next: NextFunction) => {
	const roomIdResult = nonEmptySanitizedRoomId('roomId').safeParse(req.params.roomId);

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

export const withValidRoomSecret = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RecordingTokenRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.body = data;
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
