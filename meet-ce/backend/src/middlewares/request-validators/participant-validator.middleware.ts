import { MeetRoomMemberTokenMetadata } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import { UpdateParticipantRequestSchema } from '../../models/zod-schemas/meeting.schema.js';
import { RoomMemberTokenMetadataSchema } from '../../models/zod-schemas/room.schema.js';

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
