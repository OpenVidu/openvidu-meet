import {
	MeetAppearanceConfig,
	MeetChatConfig,
	MeetE2EEConfig,
	MeetRecordingConfig,
	MeetRecordingLayout,
	MeetRoomAnonymousConfig,
	MeetRoomAutoDeletionPolicy,
	MeetRoomConfig,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomFilters,
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

const RecordingConfigSchema: z.ZodType<MeetRecordingConfig> = z.object({
	enabled: z.boolean(),
	layout: z.nativeEnum(MeetRecordingLayout).optional()
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
		e2ee: E2EEConfigSchema.optional()
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
			layout: MeetRecordingLayout.GRID
		})),
		chat: ChatConfigSchema.optional().default(() => ({ enabled: true })),
		virtualBackground: VirtualBackgroundConfigSchema.optional().default(() => ({ enabled: true })),
		e2ee: E2EEConfigSchema.optional().default(() => ({ enabled: false }))
		// appearance: AppearanceConfigSchema,
	})
	.transform((data) => {
		// Apply default layout if not provided
		if (data.recording.layout === undefined) {
			data.recording.layout = MeetRecordingLayout.GRID;
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
			layout: MeetRecordingLayout.GRID
		},
		chat: { enabled: true },
		virtualBackground: { enabled: true },
		e2ee: { enabled: false }
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

export const RoomFiltersSchema: z.ZodType<MeetRoomFilters> = z.object({
	roomName: z.string().optional(),
	status: z.nativeEnum(MeetRoomStatus).optional(),
	fields: z.string().optional(),
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
