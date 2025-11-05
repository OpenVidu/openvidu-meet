import {
	MeetChatConfig,
	MeetE2EEConfig,
	MeetRecordingAccess,
	MeetRecordingConfig,
	MeetRoomAutoDeletionPolicy,
	MeetRoomConfig,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomFilters,
	MeetRoomOptions,
	MeetRoomStatus,
	MeetRoomThemeMode,
	MeetVirtualBackgroundConfig,
	ParticipantRole,
	RecordingPermissions
} from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import ms from 'ms';
import { z } from 'zod';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { rejectUnprocessableRequest } from '../../models/error.model.js';

/**
 * Sanitizes a room name by removing invalid characters and normalizing format.
 *
 * @param val The string to sanitize
 * @returns A sanitized string safe for use as a room name
 */
export const sanitizeRoomName = (val: string): string => {
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

const RecordingAccessSchema: z.ZodType<MeetRecordingAccess> = z.nativeEnum(MeetRecordingAccess);

const RecordingConfigSchema: z.ZodType<MeetRecordingConfig> = z
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

const ChatConfigSchema: z.ZodType<MeetChatConfig> = z.object({
	enabled: z.boolean()
});

const VirtualBackgroundConfigSchema: z.ZodType<MeetVirtualBackgroundConfig> = z.object({
	enabled: z.boolean()
});

const E2EEConfigSchema: z.ZodType<MeetE2EEConfig> = z.object({
	enabled: z.boolean()
});

const ThemeModeSchema: z.ZodType<MeetRoomThemeMode> = z.nativeEnum(MeetRoomThemeMode);

const hexColorSchema = z
	.string()
	.regex(
		/^#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3})$/,
		'Must be a valid hex color code (with or without alpha)'
	);

const RoomThemeSchema = z.object({
	name: z
		.string()
		.min(1, 'Theme name cannot be empty')
		.max(50, 'Theme name cannot exceed 50 characters')
		.regex(/^[a-zA-Z0-9_-]+$/, 'Theme name can only contain letters, numbers, hyphens and underscores'),
	enabled: z.boolean(),
	baseTheme: ThemeModeSchema,
	backgroundColor: hexColorSchema.optional(),
	primaryColor: hexColorSchema.optional(),
	secondaryColor: hexColorSchema.optional(),
	accentColor: hexColorSchema.optional(),
	surfaceColor: hexColorSchema.optional()
});

export const AppearanceConfigSchema = z.object({
	themes: z.array(RoomThemeSchema).length(1, 'There must be exactly one theme defined')
});

const RoomConfigSchema: z.ZodType<MeetRoomConfig> = z
	.object({
		recording: RecordingConfigSchema,
		chat: ChatConfigSchema,
		virtualBackground: VirtualBackgroundConfigSchema,
		e2ee: E2EEConfigSchema.optional().default({ enabled: false })
		// appearance: AppearanceConfigSchema,
	})
	.transform((data) => {
		// Automatically disable recording when E2EE is enabled
		if (data.e2ee?.enabled && data.recording.enabled) {
			return {
				...data,
				recording: {
					...data.recording,
					enabled: false
				}
			};
		}

		return data;
	});

const RoomDeletionPolicyWithMeetingSchema: z.ZodType<MeetRoomDeletionPolicyWithMeeting> = z.nativeEnum(
	MeetRoomDeletionPolicyWithMeeting
);

const RoomDeletionPolicyWithRecordingsSchema: z.ZodType<MeetRoomDeletionPolicyWithRecordings> = z.nativeEnum(
	MeetRoomDeletionPolicyWithRecordings
);

const RoomAutoDeletionPolicySchema: z.ZodType<MeetRoomAutoDeletionPolicy> = z.object({
	withMeeting: RoomDeletionPolicyWithMeetingSchema,
	withRecordings: RoomDeletionPolicyWithRecordingsSchema
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
	autoDeletionPolicy: RoomAutoDeletionPolicySchema.optional()
		.default({
			withMeeting: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
			withRecordings: MeetRoomDeletionPolicyWithRecordings.CLOSE
		})
		.refine(
			(policy) => {
				return !policy || policy.withMeeting !== MeetRoomDeletionPolicyWithMeeting.FAIL;
			},
			{
				message: 'FAIL policy is not allowed for withMeeting auto-deletion policy',
				path: ['withMeeting']
			}
		)
		.refine(
			(policy) => {
				return !policy || policy.withRecordings !== MeetRoomDeletionPolicyWithRecordings.FAIL;
			},
			{
				message: 'FAIL policy is not allowed for withRecordings auto-deletion policy',
				path: ['withRecordings']
			}
		),
	config: RoomConfigSchema.optional().default({
		recording: { enabled: true, allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER },
		chat: { enabled: true },
		virtualBackground: { enabled: true },
		e2ee: { enabled: false }
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

const DeleteRoomQueryParamsSchema = z.object({
	withMeeting: RoomDeletionPolicyWithMeetingSchema.optional().default(MeetRoomDeletionPolicyWithMeeting.FAIL),
	withRecordings: RoomDeletionPolicyWithRecordingsSchema.optional().default(MeetRoomDeletionPolicyWithRecordings.FAIL)
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
	withMeeting: RoomDeletionPolicyWithMeetingSchema.optional().default(MeetRoomDeletionPolicyWithMeeting.FAIL),
	withRecordings: RoomDeletionPolicyWithRecordingsSchema.optional().default(MeetRoomDeletionPolicyWithRecordings.FAIL)
});

const UpdateRoomConfigSchema = z.object({
	config: RoomConfigSchema
});

const UpdateRoomStatusSchema = z.object({
	status: z.nativeEnum(MeetRoomStatus)
});

const RecordingTokenRequestSchema = z.object({
	secret: z.string().nonempty('Secret is required')
});

const RecordingPermissionsSchema: z.ZodType<RecordingPermissions> = z.object({
	canRetrieveRecordings: z.boolean(),
	canDeleteRecordings: z.boolean()
});

const RecordingTokenMetadataSchema = z.object({
	role: z.nativeEnum(ParticipantRole),
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

export const withValidRoomConfig = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateRoomConfigSchema.safeParse(req.body);

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

export const withValidRoomDeleteRequest = (req: Request, res: Response, next: NextFunction) => {
	const roomIdResult = nonEmptySanitizedRoomId('roomId').safeParse(req.params.roomId);

	if (!roomIdResult.success) {
		return rejectUnprocessableRequest(res, roomIdResult.error);
	}

	req.params.roomId = roomIdResult.data;

	const queryParamsResult = DeleteRoomQueryParamsSchema.safeParse(req.query);

	if (!queryParamsResult.success) {
		return rejectUnprocessableRequest(res, queryParamsResult.error);
	}

	req.query = queryParamsResult.data;
	next();
};

export const withValidRoomBulkDeleteRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = BulkDeleteRoomsSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query = data;
	next();
};

export const withValidRoomStatus = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateRoomStatusSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
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
