import { MeetPermissions, MeetRoomMemberRole, MeetRoomMemberTokenMetadata } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { rejectUnprocessableRequest } from '../../models/error.model.js';

const UpdateParticipantRequestSchema = z.object({
	role: z.nativeEnum(MeetRoomMemberRole)
});

const MeetPermissionsSchema: z.ZodType<MeetPermissions> = z.object({
	canRecord: z.boolean(),
	canRetrieveRecordings: z.boolean(),
	canDeleteRecordings: z.boolean(),
	canChat: z.boolean(),
	canChangeVirtualBackground: z.boolean()
});

const RoomMemberTokenMetadataSchema: z.ZodType<MeetRoomMemberTokenMetadata> = z.object({
	livekitUrl: z.string().url('LiveKit URL must be a valid URL'),
	role: z.nativeEnum(MeetRoomMemberRole),
	permissions: MeetPermissionsSchema
});

export const validateUpdateParticipantRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateParticipantRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateRoomMemberTokenMetadata = (metadata: unknown): MeetRoomMemberTokenMetadata => {
	const { success, error, data } = RoomMemberTokenMetadataSchema.safeParse(metadata);

	if (!success) {
		throw new Error(`Invalid metadata: ${error.message}`);
	}

	return data;
};
