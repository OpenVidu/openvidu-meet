import { MeetRecordingFilters } from '@openvidu-meet/typings';
import { z } from 'zod';
import { nonEmptySanitizedRoomId } from './room.schema.js';

export const nonEmptySanitizedRecordingId = (fieldName: string) =>
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

export const StartRecordingReqSchema = z.object({
	roomId: nonEmptySanitizedRoomId('roomId')
});

export const RecordingFiltersSchema: z.ZodType<MeetRecordingFilters> = z.object({
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
	// status: z.string().optional(),
	roomId: nonEmptySanitizedRoomId('roomId').optional(),
	roomName: z.string().optional(),
	nextPageToken: z.string().optional(),
	fields: z.string().optional()
});

export const BulkDeleteRecordingsReqSchema = z.object({
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

export const GetRecordingReqSchema = z.object({
	params: z.object({
		recordingId: nonEmptySanitizedRecordingId('recordingId')
	}),
	query: z.object({
		secret: z.string().optional()
	})
});

export const GetRecordingMediaReqSchema = z.object({
	params: z.object({
		recordingId: nonEmptySanitizedRecordingId('recordingId')
	}),
	query: z.object({
		secret: z.string().optional()
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
		.passthrough() // Allow other headers to pass through
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
