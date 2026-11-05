import {
	MEET_RECORDING_FIELDS,
	MEET_RECORDING_SORT_FIELDS,
	MeetRecordingLayout,
	MeetRecordingStatus,
	SortOrder,
	TextMatchMode
} from '@openvidu-meet/typings';
import { z } from 'zod';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { invalidRegexPatternReason } from '../../utils/string-match-filter.utils.js';
import { fieldListSchema } from './field-selection.schema.js';
import { encodingValidator } from './recording-encoding.schema.js';
import { nonEmptySanitizedRoomId, RoomIdParamSchema } from './room-id.schema.js';
import { maxItemsSchema } from './pagination.schema.js';

const fieldsSchema = fieldListSchema(MEET_RECORDING_FIELDS);

export const nonEmptySanitizedRecordingId = (fieldName: string) =>
	z
		.string()
		.min(1, { message: `${fieldName} is required and cannot be empty` })
		.transform((value) => value.trim())
		.refine((value) => value !== '', { message: `${fieldName} cannot be empty after sanitization` })
		.transform((value, ctx) => {
			// The recording ID has the form 'roomId--EG_xxx--uid', with a room ID as the room ID schema accepts it
			const [roomId, egressId, uid, ...rest] = value.split('--');
			const room = RoomIdParamSchema.safeParse(roomId);

			if (rest.length > 0 || !room.success || !egressId?.startsWith('EG_') || egressId.length <= 3 || !uid) {
				ctx.addIssue({ code: 'custom', message: `${fieldName} does not follow the expected format` });
				return z.NEVER;
			}

			return `${room.data}--${egressId}--${uid}`;
		});

export const RecordingIdParamSchema = nonEmptySanitizedRecordingId('recordingId');

export const StartRecordingReqSchema = z.object({
	roomId: nonEmptySanitizedRoomId('roomId'),
	config: z
		.object({
			layout: z.enum(MeetRecordingLayout).optional(),
			encoding: encodingValidator.optional()
		})
		.optional()
});

export const RecordingFiltersSchema = z
	.object({
		roomId: nonEmptySanitizedRoomId('roomId').optional(),
		roomName: z.string().optional(),
		roomNameMatchMode: z.enum(TextMatchMode).optional(),
		roomNameCaseInsensitive: z.preprocess((arg) => {
			if (typeof arg === 'string') {
				if (arg.toLowerCase() === 'true') return true;

				if (arg.toLowerCase() === 'false') return false;
			}

			return arg;
		}, z.boolean().optional().default(false)),
		status: z.enum(MeetRecordingStatus).optional(),
		fields: fieldsSchema,
		maxItems: maxItemsSchema,
		nextPageToken: z.string().optional(),
		sortField: z.enum(MEET_RECORDING_SORT_FIELDS).optional().default('startDate'),
		sortOrder: z.enum(SortOrder).optional().default(SortOrder.DESC)
	})
	.superRefine((data, ctx) => {
		if (data.roomNameMatchMode === TextMatchMode.REGEX && data.roomName) {
			const reason = invalidRegexPatternReason(data.roomName);

			if (reason) {
				ctx.addIssue({ code: 'custom', path: ['roomName'], message: reason });
			}
		}
	});

export const BulkDeleteRecordingsReqSchema = z.object({
	recordingIds: z.preprocess(
		(arg) => {
			if (typeof arg === 'string') {
				// If the argument is a string, it is expected to be a comma-separated list of recording IDs.
				const recordingIds = arg
					.split(',')
					.map((s) => s.trim())
					.filter((s) => s !== '');
				return Array.from(new Set(recordingIds));
			}

			return [];
		},
		z
			.array(nonEmptySanitizedRecordingId('recordingId'))
			.min(1, { message: 'At least one recordingId is required' })
			.max(INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS, {
				message: `recordingIds cannot exceed ${INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS} items`
			})
	)
});

export const RecordingQueryFieldsSchema = z.object({
	fields: fieldsSchema
});

export const GetRecordingReqSchema = z.object({
	params: z.object({
		recordingId: nonEmptySanitizedRecordingId('recordingId')
	}),
	query: z.object({
		fields: fieldsSchema,
		recordingSecret: z.string().optional()
	})
});

export const StopRecordingReqSchema = z.object({
	params: z.object({
		recordingId: nonEmptySanitizedRecordingId('recordingId')
	}),
	query: z.object({
		fields: fieldsSchema
	})
});

export const GetRecordingMediaReqSchema = z.object({
	params: z.object({
		recordingId: nonEmptySanitizedRecordingId('recordingId')
	}),
	query: z.object({
		recordingSecret: z.string().optional()
	}),
	headers: z
		.object({
			range: z
				.string()
				.regex(/^bytes=\d+-\d*$/, {
					message: 'Invalid range header format. Expected: bytes=start-end'
				})
				.optional()
		})
		.loose() // Allow other headers to pass through
});

export const GetRecordingUrlReqSchema = z.object({
	params: z.object({
		recordingId: nonEmptySanitizedRecordingId('recordingId')
	}),
	query: z.object({
		privateAccess: z
			.preprocess((val) => {
				if (typeof val === 'string') {
					return val.toLowerCase() === 'true';
				}

				return val;
			}, z.boolean())
			.default(false)
	})
});
