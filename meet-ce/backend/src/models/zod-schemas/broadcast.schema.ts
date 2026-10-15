import type {
	MeetBroadcastConfigOptions,
	MeetBroadcastDestination,
	MeetBroadcastStartOptions,
	MeetBroadcastStopOptions
} from '@openvidu-meet/typings';
import {
	isValidStreamUrl,
	MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH,
	MEET_BROADCAST_FIELDS,
	MEET_BROADCAST_MAX_DESTINATIONS,
	MeetRecordingLayout
} from '@openvidu-meet/typings';
import { z } from 'zod';
import { fieldListSchema } from './field-selection.schema.js';
import { encodingValidator } from './recording-encoding.schema.js';
import { nonEmptySanitizedRoomId } from './room-id.schema.js';

const DESTINATION_URL_MAX_LENGTH = 2048;

const destinationIdSchema = z.string().trim().min(1, 'Destination id cannot be empty');

const destinationNameSchema = z
	.string()
	.trim()
	.min(1, 'Destination name is required')
	.max(
		MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH,
		`Destination name cannot exceed ${MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH} characters`
	);

const destinationUrlSchema = z
	.url({ protocol: /^rtmps?$/, error: 'Destination url must be an rtmp:// or rtmps:// URL' })
	.max(DESTINATION_URL_MAX_LENGTH, `Destination url cannot exceed ${DESTINATION_URL_MAX_LENGTH} characters`)
	.refine(isValidStreamUrl, 'Destination url must have the form rtmp(s)://{host}(/{path})/{app}/{stream_key}');

const destinationListSchema = <T extends z.ZodType>(item: T) =>
	z
		.array(item)
		.max(MEET_BROADCAST_MAX_DESTINATIONS, `Cannot have more than ${MEET_BROADCAST_MAX_DESTINATIONS} destinations`);

const BroadcastDestinationSchema: z.ZodType<MeetBroadcastDestination> = z.object({
	id: destinationIdSchema.optional(),
	name: destinationNameSchema,
	url: destinationUrlSchema
});

export const BroadcastConfigSchema: z.ZodType<MeetBroadcastConfigOptions> = z.object({
	enabled: z.boolean(),
	destinations: destinationListSchema(BroadcastDestinationSchema).optional(),
	layout: z.enum(MeetRecordingLayout).optional(),
	encoding: encodingValidator.optional()
});

const BroadcastStartDestinationSchema = z
	.object({
		destinationId: destinationIdSchema.optional(),
		name: destinationNameSchema.optional(),
		url: destinationUrlSchema.optional()
	})
	.refine(({ destinationId, name, url }) => (destinationId ? !name && !url : Boolean(name && url)), {
		message: 'A destination is either the destinationId of a room destination alone, or a name and a url'
	});

/** A broadcast id, which names the room it belongs to: `{roomId}--{id}`. */
const broadcastIdSchema = z
	.string()
	.trim()
	.refine((broadcastId) => {
		const [roomId, id, ...rest] = broadcastId.split('--');
		return Boolean(roomId && id) && rest.length === 0;
	}, 'Broadcast id must have the form {roomId}--{id}');

const fieldsSchema = fieldListSchema(MEET_BROADCAST_FIELDS);

export const StartBroadcastReqSchema: z.ZodType<MeetBroadcastStartOptions & { roomId: string }> = z.object({
	roomId: nonEmptySanitizedRoomId('roomId'),
	destinations: destinationListSchema(BroadcastStartDestinationSchema)
		.min(1, 'At least one destination is required')
		.optional()
});

export const BulkStopBroadcastsReqSchema: z.ZodType<MeetBroadcastStopOptions & { roomId: string }> = z.object({
	roomId: nonEmptySanitizedRoomId('roomId'),
	broadcastIds: z
		.array(broadcastIdSchema)
		.min(1, 'At least one broadcast id is required')
		.max(MEET_BROADCAST_MAX_DESTINATIONS, `Cannot stop more than ${MEET_BROADCAST_MAX_DESTINATIONS} broadcasts`)
		.optional()
});

export const BroadcastIdParamsSchema = z.object({
	broadcastId: broadcastIdSchema
});

export const BroadcastFieldsQuerySchema = z.object({
	fields: fieldsSchema
});

export const GetBroadcastsQuerySchema = z.object({
	roomId: nonEmptySanitizedRoomId('roomId'),
	fields: fieldsSchema
});
