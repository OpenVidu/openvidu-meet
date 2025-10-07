import { MeetTokenMetadata, OpenViduMeetPermissions, ParticipantOptions, ParticipantRole } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import { nonEmptySanitizedRoomId } from './room-validator.middleware.js';

const ParticipantTokenRequestSchema: z.ZodType<ParticipantOptions> = z.object({
	roomId: nonEmptySanitizedRoomId('roomId'),
	secret: z.string().nonempty('Secret is required'),
	participantName: z.string().optional(),
	participantIdentity: z.string().optional()
});

const UpdateParticipantRequestSchema = z.object({
	role: z.enum([ParticipantRole.MODERATOR, ParticipantRole.SPEAKER])
});

const OpenViduMeetPermissionsSchema: z.ZodType<OpenViduMeetPermissions> = z.object({
	canRecord: z.boolean(),
	canChat: z.boolean(),
	canChangeVirtualBackground: z.boolean()
});

const MeetTokenMetadataSchema: z.ZodType<MeetTokenMetadata> = z.object({
	livekitUrl: z.string().url('LiveKit URL must be a valid URL'),
	roles: z.array(
		z.object({
			role: z.enum([ParticipantRole.MODERATOR, ParticipantRole.SPEAKER]),
			permissions: OpenViduMeetPermissionsSchema
		})
	),
	selectedRole: z.enum([ParticipantRole.MODERATOR, ParticipantRole.SPEAKER])
});

export const validateParticipantTokenRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = ParticipantTokenRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateUpdateParticipantRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateParticipantRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateMeetTokenMetadata = (metadata: unknown): MeetTokenMetadata => {
	const { success, error, data } = MeetTokenMetadataSchema.safeParse(metadata);

	if (!success) {
		throw new Error(`Invalid metadata: ${error.message}`);
	}

	return data;
};
