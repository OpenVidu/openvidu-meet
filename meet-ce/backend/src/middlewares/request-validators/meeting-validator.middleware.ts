import type { NextFunction, Request, Response } from 'express';
import {
	LobbyDecisionReqSchema,
	LobbyLeaveReqSchema,
	LowerAllHandsReqSchema,
	MuteParticipantMediaReqSchema,
	SendParticipantReactionReqSchema,
	UpdateParticipantHandReqSchema,
	UpdateParticipantRoleReqSchema
} from '../../models/zod-schemas/meeting.schema.js';
import { rejectUnprocessableRequest } from '../error-handler.middleware.js';

export const validateUpdateParticipantRoleReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateParticipantRoleReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateMuteParticipantMediaReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = MuteParticipantMediaReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateUpdateParticipantHandReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateParticipantHandReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateLowerAllHandsReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = LowerAllHandsReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateSendParticipantReactionReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = SendParticipantReactionReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

/** An empty body decides on everyone waiting. */
export const validateLobbyDecisionReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = LobbyDecisionReqSchema.safeParse(req.body ?? {});

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateLobbyLeaveReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = LobbyLeaveReqSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	res.locals.validatedQuery = data;
	next();
};
