import type {
	MeetBroadcastConfig,
	MeetBroadcastDestination,
	MeetBroadcastDestinationOptions,
	MeetBroadcastDestinationUpdateOptions,
	MeetBroadcastStartOptions
} from '@openvidu-meet/typings';
import {
	MEET_BROADCAST_DESTINATION_NAME_MAX_LENGTH,
	MEET_BROADCAST_MAX_DESTINATIONS,
	MeetRecordingLayout
} from '@openvidu-meet/typings';
import { z } from 'zod';
import { encodingValidator } from './recording-encoding.schema.js';

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
	.max(DESTINATION_URL_MAX_LENGTH, `Destination url cannot exceed ${DESTINATION_URL_MAX_LENGTH} characters`);

const destinationListSchema = <T extends z.ZodType>(item: T) =>
	z
		.array(item)
		.max(MEET_BROADCAST_MAX_DESTINATIONS, `Cannot have more than ${MEET_BROADCAST_MAX_DESTINATIONS} destinations`);

const BroadcastDestinationSchema: z.ZodType<MeetBroadcastDestination> = z.object({
	id: destinationIdSchema.optional(),
	name: destinationNameSchema,
	url: destinationUrlSchema
});

export const BroadcastConfigSchema: z.ZodType<MeetBroadcastConfig> = z
	.object({
		enabled: z.boolean(),
		destinations: destinationListSchema(BroadcastDestinationSchema),
		layout: z.enum(MeetRecordingLayout).optional(),
		encoding: encodingValidator.optional()
	})
	.refine((config) => !config.enabled || config.destinations.length > 0, {
		message: 'At least one destination is required while broadcast is enabled',
		path: ['destinations']
	});

const BroadcastStartDestinationSchema = z
	.object({
		id: destinationIdSchema.optional(),
		name: destinationNameSchema.optional(),
		url: destinationUrlSchema.optional()
	})
	.refine(({ id, name, url }) => (id ? !name && !url : Boolean(name && url)), {
		message: 'A destination is either the id of a room destination alone, or a name and a url'
	});

export const StartBroadcastReqSchema: z.ZodType<MeetBroadcastStartOptions> = z.object({
	destinations: destinationListSchema(BroadcastStartDestinationSchema)
		.min(1, 'At least one destination is required')
		.optional()
});

export const AddBroadcastDestinationReqSchema: z.ZodType<MeetBroadcastDestinationOptions> = z.object({
	name: destinationNameSchema,
	url: destinationUrlSchema
});

export const UpdateBroadcastDestinationReqSchema: z.ZodType<MeetBroadcastDestinationUpdateOptions> = z.object({
	active: z.boolean()
});
