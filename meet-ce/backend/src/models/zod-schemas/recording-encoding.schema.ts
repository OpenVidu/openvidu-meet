import type { MeetRecordingEncodingOptions } from '@openvidu-meet/typings';
import { MeetRecordingAudioCodec, MeetRecordingEncodingPreset, MeetRecordingVideoCodec } from '@openvidu-meet/typings';
import { z } from 'zod';

export const EncodingOptionsSchema: z.ZodType<MeetRecordingEncodingOptions> = z.object({
	video: z.object({
		width: z.number().positive('Video width must be a positive number'),
		height: z.number().positive('Video height must be a positive number'),
		framerate: z.number().positive('Video framerate must be a positive number'),
		codec: z.enum(MeetRecordingVideoCodec),
		bitrate: z.number().positive('Video bitrate must be a positive number'),
		keyFrameInterval: z.number().positive('Video keyFrameInterval must be a positive number'),
		depth: z.number().positive('Video depth must be a positive number')
	}),
	audio: z.object({
		codec: z.enum(MeetRecordingAudioCodec),
		bitrate: z.number().positive('Audio bitrate must be a positive number'),
		frequency: z.number().positive('Audio frequency must be a positive number')
	})
});

/**
 * Custom encoding validator to handle both preset strings and encoding objects.
 * Used in RecordingConfigSchema
 */
export const encodingValidator = z.any().superRefine((value: unknown, ctx) => {
	// If undefined, skip validation (it's optional)
	if (value === undefined) {
		return;
	}

	// Check if it's a string preset
	if (typeof value === 'string') {
		const presetValues: string[] = Object.values(MeetRecordingEncodingPreset);

		if (!presetValues.includes(value)) {
			ctx.addIssue({
				code: 'custom',
				message: `Invalid encoding preset. Must be one of: ${presetValues.join(', ')}`
			});
		}

		return;
	}

	// If it's not a string, it must be an encoding object
	if (typeof value !== 'object' || value === null) {
		ctx.addIssue({
			code: 'custom',
			message: 'Encoding must be either a preset string or an encoding configuration object'
		});
		return;
	}

	const encoding = value as Record<string, unknown>;

	// Both video and audio must be provided
	if (!encoding.video || !encoding.audio) {
		ctx.addIssue({
			code: 'custom',
			message: 'Both video and audio configuration must be provided when using encoding options'
		});
		return;
	}

	if (encoding.video === null || typeof encoding.video !== 'object') {
		ctx.addIssue({
			code: 'custom',
			message: 'Video encoding must be a valid object'
		});
		return;
	}

	if (encoding.audio === null || typeof encoding.audio !== 'object') {
		ctx.addIssue({
			code: 'custom',
			message: 'Audio encoding must be a valid object'
		});
		return;
	}

	const videoEncoding = encoding.video;
	const audioEncoding = encoding.audio;

	// Check video fields
	const requiredVideoFields = ['width', 'height', 'framerate', 'codec', 'bitrate', 'keyFrameInterval', 'depth'];
	const missingVideoFields = requiredVideoFields.filter((field) => !(field in videoEncoding));

	if (missingVideoFields.length > 0) {
		ctx.addIssue({
			code: 'custom',
			message: `When video encoding is provided, required fields are missing: ${missingVideoFields.join(', ')}`,
			path: ['video']
		});
	}

	// Check audio fields
	const requiredAudioFields = ['codec', 'bitrate', 'frequency'];
	const missingAudioFields = requiredAudioFields.filter((field) => !(field in audioEncoding));

	if (missingAudioFields.length > 0) {
		ctx.addIssue({
			code: 'custom',
			message: `When audio encoding is provided, required fields are missing: ${missingAudioFields.join(', ')}`,
			path: ['audio']
		});
	}

	// Validate the actual types and values using the schema
	const result = EncodingOptionsSchema.safeParse(value);

	if (!result.success) {
		result.error.issues.forEach((issue) => {
			ctx.addIssue({
				code: 'custom',
				message: issue.message,
				path: issue.path
			});
		});
	}
});
