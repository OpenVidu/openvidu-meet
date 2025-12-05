import { MeetRoomMemberTokenMetadata } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import {
	BulkDeleteRoomMembersReqSchema,
	RoomMemberFiltersSchema,
	RoomMemberOptionsSchema,
	RoomMemberTokenMetadataSchema,
	RoomMemberTokenOptionsSchema,
	UpdateRoomMemberReqSchema
} from '../../models/zod-schemas/room-member.schema.js';

export const validateCreateRoomMemberReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomMemberOptionsSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateGetRoomMembersReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomMemberFiltersSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query = {
		...data,
		maxItems: data.maxItems?.toString()
	};
	next();
};

export const validateBulkDeleteRoomMembersReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = BulkDeleteRoomMembersReqSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query = data;
	next();
};

export const validateUpdateRoomMemberReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateRoomMemberReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateCreateRoomMemberTokenReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomMemberTokenOptionsSchema.safeParse(req.body);

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
