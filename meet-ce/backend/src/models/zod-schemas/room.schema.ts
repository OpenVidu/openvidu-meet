import {
	MEET_ROOM_EXPANDABLE_FIELDS,
	MEET_ROOM_FIELDS,
	MeetAppearanceConfig,
	MeetChatConfig,
	MeetE2EEConfig,
	MeetRecordingAudioCodec,
	MeetRecordingConfig,
	MeetRecordingEncodingOptions,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout,
	MeetRecordingVideoCodec,
	MeetRoomAnonymousConfig,
	MeetRoomAutoDeletionPolicy,
	MeetRoomCaptionsConfig,
	MeetRoomConfig,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomExpandableProperties,
	MeetRoomField,
	MeetRoomOptions,
	MeetRoomRolesConfig,
	MeetRoomStatus,
	MeetRoomTheme,
	MeetRoomThemeMode,
	MeetVirtualBackgroundConfig
} from '@openvidu-meet/typings';
import ms from 'ms';
import { z } from 'zod';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { MeetRoomHelper } from '../../helpers/room.helper.js';
import { PartialMeetPermissionsSchema } from './room-member.schema.js';

export const nonEmptySanitizedRoomId = (fieldName: string) =>
	z
		.string()
		.min(1, { message: `${fieldName} is required and cannot be empty` })
		.max(100, { message: `${fieldName} cannot exceed 100 characters` })
		.transform(MeetRoomHelper.sanitizeRoomId)
		.refine((data) => data !== '', {
			message: `${fieldName} cannot be empty after sanitization`
		});

// Encoding options validation - both video and audio are required with all their fields
export const EncodingOptionsSchema: z.ZodType<MeetRecordingEncodingOptions> = z.object({
	video: z.object({
		width: z.number().positive('Video width must be a positive number'),
		height: z.number().positive('Video height must be a positive number'),
		framerate: z.number().positive('Video framerate must be a positive number'),
		codec: z.nativeEnum(MeetRecordingVideoCodec),
		bitrate: z.number().positive('Video bitrate must be a positive number'),
		keyFrameInterval: z.number().positive('Video keyFrameInterval must be a positive number'),
		depth: z.number().positive('Video depth must be a positive number')
	}),
	audio: z.object({
		codec: z.nativeEnum(MeetRecordingAudioCodec),
		bitrate: z.number().positive('Audio bitrate must be a positive number'),
		frequency: z.number().positive('Audio frequency must be a positive number')
	})
});

/**
 * Custom encoding validator to handle both preset strings and encoding objects.
 * Used in RecordingConfigSchema
 */
export const encodingValidator = z.any().superRefine((value, ctx) => {
	// If undefined, skip validation (it's optional)
	if (value === undefined) {
		return;
	}

	// Check if it's a string preset
	if (typeof value === 'string') {
		const presetValues = Object.values(MeetRecordingEncodingPreset);

		if (!presetValues.includes(value as MeetRecordingEncodingPreset)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Invalid encoding preset. Must be one of: ${presetValues.join(', ')}`
			});
		}

		return;
	}

	// If it's not a string, it must be an encoding object
	if (typeof value !== 'object' || value === null) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: 'Encoding must be either a preset string or an encoding configuration object'
		});
		return;
	}

	// Both video and audio must be provided
	if (!value.video || !value.audio) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: 'Both video and audio configuration must be provided when using encoding options'
		});
		return;
	}

	if (value.video === null || typeof value.video !== 'object') {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: 'Video encoding must be a valid object'
		});
		return;
	}

	if (value.audio === null || typeof value.audio !== 'object') {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: 'Audio encoding must be a valid object'
		});
		return;
	}

	// Check video fields
	const requiredVideoFields = ['width', 'height', 'framerate', 'codec', 'bitrate', 'keyFrameInterval', 'depth'];
	const missingVideoFields = requiredVideoFields.filter((field) => !(field in value.video));

	if (missingVideoFields.length > 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `When video encoding is provided, required fields are missing: ${missingVideoFields.join(', ')}`,
			path: ['video']
		});
	}

	// Check audio fields
	const requiredAudioFields = ['codec', 'bitrate', 'frequency'];
	const missingAudioFields = requiredAudioFields.filter((field) => !(field in value.audio));

	if (missingAudioFields.length > 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `When audio encoding is provided, required fields are missing: ${missingAudioFields.join(', ')}`,
			path: ['audio']
		});
	}

	// Validate the actual types and values using the schema
	const result = EncodingOptionsSchema.safeParse(value);

	if (!result.success) {
		result.error.issues.forEach((issue) => {
			ctx.addIssue(issue);
		});
	}
});

const RecordingConfigSchema: z.ZodType<MeetRecordingConfig> = z.object({
	enabled: z.boolean(),
	layout: z.nativeEnum(MeetRecordingLayout).optional(),
	encoding: encodingValidator.optional()
});

const ChatConfigSchema: z.ZodType<MeetChatConfig> = z.object({
	enabled: z.boolean()
});

const VirtualBackgroundConfigSchema: z.ZodType<MeetVirtualBackgroundConfig> = z.object({
	enabled: z.boolean()
});

const E2EEConfigSchema: z.ZodType<MeetE2EEConfig> = z.object({
	enabled: z.boolean()
});

const CaptionsConfigSchema: z.ZodType<MeetRoomCaptionsConfig> = z.object({
	enabled: z.boolean()
});

const ThemeModeSchema: z.ZodType<MeetRoomThemeMode> = z.nativeEnum(MeetRoomThemeMode);

const hexColorSchema = z
	.string()
	.regex(
		/^#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3})$/,
		'Must be a valid hex color code (with or without alpha)'
	);

const RoomThemeSchema: z.ZodType<MeetRoomTheme> = z.object({
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

export const AppearanceConfigSchema: z.ZodType<MeetAppearanceConfig> = z.object({
	themes: z.array(RoomThemeSchema).length(1, 'There must be exactly one theme defined')
});

/**
 * Schema for updating room config (partial updates allowed)
 * Used when updating an existing room's config - missing fields keep their current values
 */
const UpdateRoomConfigSchema: z.ZodType<Partial<MeetRoomConfig>> = z
	.object({
		recording: RecordingConfigSchema.optional(),
		chat: ChatConfigSchema.optional(),
		virtualBackground: VirtualBackgroundConfigSchema.optional(),
		e2ee: E2EEConfigSchema.optional(),
		captions: CaptionsConfigSchema.optional()
		// appearance: AppearanceConfigSchema,
	})
	.transform((data: Partial<MeetRoomConfig>) => {
		// Automatically disable recording when E2EE is enabled
		if (data.e2ee?.enabled && data.recording?.enabled) {
			data.recording = {
				...data.recording,
				enabled: false
			};
		}

		return data;
	});

/**
 * Schema for creating room config (applies defaults for missing fields)
 * Used when creating a new room - missing fields get default values
 *
 * IMPORTANT: Using functions in .default() to avoid shared mutable state.
 * Each call creates a new object instance instead of reusing the same reference.
 */
const CreateRoomConfigSchema = z
	.object({
		recording: RecordingConfigSchema.optional().default(() => ({
			enabled: true,
			layout: MeetRecordingLayout.GRID,
			encoding: MeetRecordingEncodingPreset.H264_720P_30
		})),
		chat: ChatConfigSchema.optional().default(() => ({ enabled: true })),
		virtualBackground: VirtualBackgroundConfigSchema.optional().default(() => ({ enabled: true })),
		e2ee: E2EEConfigSchema.optional().default(() => ({ enabled: false })),
		captions: CaptionsConfigSchema.optional().default(() => ({ enabled: true }))
		// appearance: AppearanceConfigSchema,
	})
	.transform((data) => {
		// Apply default layout if not provided
		if (data.recording.layout === undefined) {
			data.recording.layout = MeetRecordingLayout.GRID;
		}

		// Apply default encoding if not provided
		if (data.recording.encoding === undefined) {
			data.recording.encoding = MeetRecordingEncodingPreset.H264_720P_30;
		}

		// Automatically disable recording when E2EE is enabled
		if (data.e2ee.enabled && data.recording.enabled) {
			data.recording = {
				...data.recording,
				enabled: false
			};
		}

		return data as MeetRoomConfig;
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

const RoomRolesConfigSchema: z.ZodType<MeetRoomRolesConfig> = z.object({
	moderator: z
		.object({
			permissions: PartialMeetPermissionsSchema
		})
		.optional(),
	speaker: z
		.object({
			permissions: PartialMeetPermissionsSchema
		})
		.optional()
});

const RoomAnonymousConfigSchema: z.ZodType<MeetRoomAnonymousConfig> = z.object({
	moderator: z
		.object({
			enabled: z.boolean()
		})
		.optional(),
	speaker: z
		.object({
			enabled: z.boolean()
		})
		.optional()
});

export const RoomOptionsSchema: z.ZodType<MeetRoomOptions> = z.object({
	roomName: z
		.string()
		.max(50, 'roomName cannot exceed 50 characters')
		.transform(MeetRoomHelper.sanitizeRoomName)
		.optional()
		.default('Room'),
	autoDeletionDate: z
		.number()
		.positive('autoDeletionDate must be a positive integer')
		.refine(
			(date) => date >= Date.now() + ms(INTERNAL_CONFIG.MIN_ROOM_AUTO_DELETE_DURATION),
			`autoDeletionDate must be at least ${INTERNAL_CONFIG.MIN_ROOM_AUTO_DELETE_DURATION} in the future`
		)
		.optional(),
	autoDeletionPolicy: RoomAutoDeletionPolicySchema.optional()
		.default(() => ({
			withMeeting: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
			withRecordings: MeetRoomDeletionPolicyWithRecordings.CLOSE
		}))
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
	config: CreateRoomConfigSchema.optional().default({
		recording: {
			enabled: true,
			layout: MeetRecordingLayout.GRID,
			encoding: MeetRecordingEncodingPreset.H264_720P_30
		},
		chat: { enabled: true },
		virtualBackground: { enabled: true },
		e2ee: { enabled: false },
		captions: { enabled: true }
	}),
	roles: RoomRolesConfigSchema.optional(),
	anonymous: RoomAnonymousConfigSchema.optional().default({
		moderator: { enabled: true },
		speaker: { enabled: true }
	})
	// maxParticipants: z
	// 	.number()
	// 	.positive('Max participants must be a positive integer')
	// 	.nullable()
	// 	.optional()
	// 	.default(null)
});

// Shared expand validation schema for Room entity
// Validates and transforms comma-separated string to typed array
const expandSchema = z
	.string()
	.optional()
	.refine(
		(value) => {
			if (!value) return true;

			const allowed = MEET_ROOM_EXPANDABLE_FIELDS;
			const requested = value.split(',').map((p) => p.trim());

			return requested.every((p) => allowed.includes(p as MeetRoomExpandableProperties));
		},
		{
			message: `Invalid expand properties. Valid options: ${MEET_ROOM_EXPANDABLE_FIELDS.join(', ')}`
		}
	)
	.transform((value) => {
		// Transform to typed array of MeetRoomExpandableProperties
		if (!value) return undefined;

		const allowed = MEET_ROOM_EXPANDABLE_FIELDS;
		const requested = value.split(',').map((p) => p.trim());
		const valid = requested.filter((p) => allowed.includes(p as MeetRoomExpandableProperties));

		return valid.length > 0 ? (valid as MeetRoomExpandableProperties[]) : undefined;
	});

// Shared fields validation schema for Room entity
// Validates and transforms comma-separated string to typed array
// Only allows fields that exist in MEET_ROOM_FIELDS
const fieldsSchema = z
	.string()
	.optional()
	.transform((value) => {
		if (!value) return undefined;

		const requested = value
			.split(',')
			.map((field) => field.trim())
			.filter((field) => field !== '');

		// Filter: only keep valid fields that exist in MeetRoom
		const validFields = requested.filter((field) =>
			MEET_ROOM_FIELDS.includes(field as MeetRoomField)
		) as MeetRoomField[];

		// Deduplicate
		const unique = Array.from(new Set(validFields));

		return unique.length > 0 ? unique : [];
	});

export const RoomFiltersSchema = z.object({
	roomName: z.string().optional(),
	status: z.nativeEnum(MeetRoomStatus).optional(),
	fields: fieldsSchema,
	expand: expandSchema,
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
	sortField: z.enum(['creationDate', 'roomName', 'autoDeletionDate']).optional().default('creationDate'),
	sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

export const GetRoomQuerySchema = z.object({
	fields: fieldsSchema,
	expand: expandSchema
});

export const CreateRoomHeadersSchema = z.object({
	'x-fields': fieldsSchema,
	'x-expand': expandSchema
});

export const DeleteRoomReqSchema = z.object({
	withMeeting: RoomDeletionPolicyWithMeetingSchema.optional().default(MeetRoomDeletionPolicyWithMeeting.FAIL),
	withRecordings: RoomDeletionPolicyWithRecordingsSchema.optional().default(MeetRoomDeletionPolicyWithRecordings.FAIL)
});

export const BulkDeleteRoomsReqSchema = z.object({
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
				const transformed = MeetRoomHelper.sanitizeRoomId(id);

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

export const UpdateRoomConfigReqSchema = z.object({
	config: UpdateRoomConfigSchema
});

export const UpdateRoomRolesReqSchema = z.object({
	roles: RoomRolesConfigSchema
});

export const UpdateRoomAnonymousReqSchema = z.object({
	anonymous: RoomAnonymousConfigSchema
});

export const UpdateRoomStatusReqSchema = z.object({
	status: z.enum([MeetRoomStatus.OPEN, MeetRoomStatus.CLOSED])
});
