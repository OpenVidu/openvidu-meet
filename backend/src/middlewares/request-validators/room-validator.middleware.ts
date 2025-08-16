import {
	MeetChatPreferences,
	MeetRecordingAccess,
	MeetRecordingPreferences,
	MeetRoomFilters,
	MeetRoomOptions,
	MeetRoomPreferences,
	MeetVirtualBackgroundPreferences,
	ParticipantRole,
	RecordingPermissions
} from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import ms from 'ms';
import { z } from 'zod';
import INTERNAL_CONFIG from '../../config/internal-config.js';
import { rejectUnprocessableRequest } from '../../models/error.model.js';

/**
 * Sanitizes a room name by removing invalid characters and normalizing format.
 *
 * @param val The string to sanitize
 * @returns A sanitized string safe for use as a room name
 */
const sanitizeRoomName = (val: string): string => {
	return val
		.trim() // Remove leading/trailing spaces
		.replace(/[^a-zA-Z0-9_-\s]/g, '') // Allow alphanumeric, underscores, hyphens and spaces
		.replace(/\s+/g, ' ') // Replace multiple consecutive spaces with a single space
		.replace(/-+/g, '-') // Replace multiple consecutive hyphens with a single hyphen
		.replace(/_+/g, '_') // Replace multiple consecutive underscores with a single underscore
		.replace(/-+$/, '') // Remove trailing hyphens
		.replace(/_+$/, '') // Remove trailing underscores
		.replace(/^-+/, '') // Remove leading hyphens
		.replace(/^_+/, ''); // Remove leading underscores
};

/**
 * Sanitizes an identifier by removing/replacing invalid characters
 * and normalizing format.
 *
 * @param val The string to sanitize
 * @returns A sanitized string safe for use as an identifier
 */
const sanitizeRoomId = (val: string): string => {
	return sanitizeRoomName(val).replace(/\s+/g, ''); // Remove all spaces
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
	MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
]);

const RecordingPreferencesSchema: z.ZodType<MeetRecordingPreferences> = z
	.object({
		enabled: z.boolean(),
		allowAccessTo: RecordingAccessSchema.optional()
	})
	.refine(
		(data) => {
			// If recording is enabled, allowAccessTo must be provided
			return !data.enabled || data.allowAccessTo !== undefined;
		},
		{
			message: 'allowAccessTo is required when recording is enabled',
			path: ['allowAccessTo']
		}
	);

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
	roomName: z
		.string()
		.max(50, 'roomName cannot exceed 50 characters')
		.transform(sanitizeRoomName)
		.optional()
		.default('Room'),
	autoDeletionDate: z
		.number()
		.positive('autoDeletionDate must be a positive integer')
		.refine(
			(date) => date >= Date.now() + ms(INTERNAL_CONFIG.MIN_FUTURE_TIME_FOR_ROOM_AUTODELETION_DATE),
			`autoDeletionDate must be at least ${INTERNAL_CONFIG.MIN_FUTURE_TIME_FOR_ROOM_AUTODELETION_DATE} in the future`
		)
		.optional(),
	preferences: RoomPreferencesSchema.optional().default({
		recordingPreferences: { enabled: true, allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER },
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
	roomName: z.string().transform(sanitizeRoomName).optional(),
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

const RecordingPermissionsSchema: z.ZodType<RecordingPermissions> = z.object({
	canRetrieveRecordings: z.boolean(),
	canDeleteRecordings: z.boolean()
});

const RecordingTokenMetadataSchema = z.object({
	role: z.enum([ParticipantRole.MODERATOR, ParticipantRole.SPEAKER]),
	recordingPermissions: RecordingPermissionsSchema
});

export const withValidRoomOptions = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomRequestOptionsSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const withValidRoomFiltersRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRoomFiltersSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
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
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const withValidRoomId = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = nonEmptySanitizedRoomId('roomId').safeParse(req.params.roomId);

	if (!success) {
		error.errors[0].path = ['roomId'];
		return rejectUnprocessableRequest(res, error);
	}

	req.params.roomId = data;
	next();
};

export const withValidRoomBulkDeleteRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = BulkDeleteRoomsSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query.roomIds = data.roomIds as any;
	req.query.force = data.force ? 'true' : 'false';
	next();
};

export const withValidRoomDeleteRequest = (req: Request, res: Response, next: NextFunction) => {
	const roomIdResult = nonEmptySanitizedRoomId('roomId').safeParse(req.params.roomId);

	if (!roomIdResult.success) {
		return rejectUnprocessableRequest(res, roomIdResult.error);
	}

	req.params.roomId = roomIdResult.data;

	const forceResult = validForceQueryParam().safeParse(req.query.force);

	if (!forceResult.success) {
		return rejectUnprocessableRequest(res, forceResult.error);
	}

	req.query.force = forceResult.data ? 'true' : 'false';
	next();
};

export const withValidRoomSecret = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RecordingTokenRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateRecordingTokenMetadata = (metadata: unknown) => {
	const { success, error, data } = RecordingTokenMetadataSchema.safeParse(metadata);

	if (!success) {
		throw new Error(`Invalid metadata: ${error.message}`);
	}

	return data;
};
