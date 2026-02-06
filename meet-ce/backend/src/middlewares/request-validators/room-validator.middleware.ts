import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import {
	BulkDeleteRoomsReqSchema,
	CreateRoomHeadersSchema,
	DeleteRoomReqSchema,
	GetRoomQuerySchema,
	nonEmptySanitizedRoomId,
	RoomFiltersSchema,
	RoomOptionsSchema,
	UpdateRoomAnonymousReqSchema,
	UpdateRoomConfigReqSchema,
	UpdateRoomRolesReqSchema,
	UpdateRoomStatusReqSchema
} from '../../models/zod-schemas/room.schema.js';

export const validateCreateRoomReq = (req: Request, res: Response, next: NextFunction) => {
	const bodyResult = RoomOptionsSchema.safeParse(req.body);

	if (!bodyResult.success) {
		return rejectUnprocessableRequest(res, bodyResult.error);
	}

	// Validate X-Fields and X-Expand headers
	const headersResult = CreateRoomHeadersSchema.safeParse(req.headers);

	if (!headersResult.success) {
		return rejectUnprocessableRequest(res, headersResult.error);
	}

	req.body = bodyResult.data;
	// Store validated headers in a custom property for controller access
	(req as any).validatedHeaders = headersResult.data;
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

export const validateGetRoomReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = GetRoomQuerySchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.query = data;
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

export const validateUpdateRoomRolesReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateRoomRolesReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateUpdateRoomAnonymousReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateRoomAnonymousReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
