import {
	MeetChatPreferences,
	MeetRoomOptions,
	MeetRecordingPreferences,
	MeetRoomPreferences,
	MeetVirtualBackgroundPreferences
} from '@typings-ce';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const RecordingPreferencesSchema: z.ZodType<MeetRecordingPreferences> = z.object({
	enabled: z.boolean()
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
	expirationDate: z
		.number()
		.positive('Expiration date must be a positive integer')
		.min(Date.now(), 'Expiration date must be in the future'),
	roomIdPrefix: z
		.string()
		.transform(
			(val) =>
				val
					.trim() // Remove leading and trailing spaces
					.replace(/\s+/g, '') // Remove all whitespace instead of replacing it with hyphens
					.replace(/[^a-zA-Z0-9-]/g, '') // Remove any character except letters, numbers, and hyphens
					.replace(/-+/g, '-') // Replace multiple consecutive hyphens with a single one
					.replace(/-+$/, '') // Remove trailing hyphens
		)
		.optional()
		.default(''),
	preferences: RoomPreferencesSchema.optional().default({
		recordingPreferences: { enabled: true },
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

const GetParticipantRoleSchema = z.object({
	secret: z.string()
});

export const withValidRoomOptions = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomRequestOptionsSchema.safeParse(req.body);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateGetRoomQueryParams = (req: Request, res: Response, next: NextFunction) => {
	const fieldsQuery = req.query.fields as string | undefined;

	if (fieldsQuery) {
		const fields = fieldsQuery.split(',').map((f) => f.trim());
		req.query.fields = fields;
	}

	next();
};

export const validateGetParticipantRoleRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetParticipantRoleSchema.safeParse(req.query);

	if (!success) {
		const errors = error.errors.map((error) => ({
			field: error.path.join('.'),
			message: error.message
		}));

		return res.status(422).json({
			error: 'Unprocessable Entity',
			message: 'Invalid request query',
			details: errors
		});
	}

	req.query = data;
	next();
};

const rejectRequest = (res: Response, error: z.ZodError) => {
	const errors = error.errors.map((error) => ({
		field: error.path.join('.'),
		message: error.message
	}));

	return res.status(422).json({
		error: 'Unprocessable Entity',
		message: 'Invalid request body',
		details: errors
	});
};
