import { MeetRoomMemberTokenMetadata } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import {
	BulkDeleteRoomsReqSchema,
	DeleteRoomReqSchema,
	RoomFiltersSchema,
	nonEmptySanitizedRoomId,
	RoomMemberTokenMetadataSchema,
	RoomMemberTokenOptionsSchema,
	RoomOptionsSchema,
	UpdateRoomConfigReqSchema,
	UpdateRoomStatusReqSchema
} from '../../models/zod-schemas/room.schema.js';

export const validateCreateRoomReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomOptionsSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateGetRoomsReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = RoomFiltersSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query = {
		...data,
		maxItems: data.maxItems?.toString()
	};
	next();
};

export const validateBulkDeleteRoomsReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = BulkDeleteRoomsReqSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query = data;
	next();
};

export const withValidRoomId = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = nonEmptySanitizedRoomId('roomId').safeParse(req.params.roomId);

	if (!success) {
		error.errors[0].path = ['roomId'];
		return rejectUnprocessableRequest(res, error);
	}

	req.params.roomId = data;
	next();
};

export const validateDeleteRoomReq = (req: Request, res: Response, next: NextFunction) => {
	const roomIdResult = nonEmptySanitizedRoomId('roomId').safeParse(req.params.roomId);

	if (!roomIdResult.success) {
		return rejectUnprocessableRequest(res, roomIdResult.error);
	}

	req.params.roomId = roomIdResult.data;

	const queryParamsResult = DeleteRoomReqSchema.safeParse(req.query);

	if (!queryParamsResult.success) {
		return rejectUnprocessableRequest(res, queryParamsResult.error);
	}

	req.query = queryParamsResult.data;
	next();
};

export const validateUpdateRoomConfigReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateRoomConfigReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateUpdateRoomStatusReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateRoomStatusReqSchema.safeParse(req.body);

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
