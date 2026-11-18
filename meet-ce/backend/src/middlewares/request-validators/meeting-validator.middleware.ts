import { MEET_MEETING_EXTRA_FIELDS } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { mergeFieldsHeaderIntoQuery } from '../../models/zod-schemas/field-selection.schema.js';
import {
	BulkRejectWaitingParticipantsReqSchema,
	WaitingParticipantLeaveReqSchema,
	GetMeetingQuerySchema,
	LowerAllHandsReqSchema,
	MuteParticipantMediaReqSchema,
	SendParticipantReactionReqSchema,
	UpdateParticipantHandReqSchema,
	UpdateParticipantRoleReqSchema
} from '../../models/zod-schemas/meeting.schema.js';
import { rejectUnprocessableRequest } from '../error-handler.middleware.js';

export const validateGetMeetingReq = (req: Request, res: Response, next: NextFunction) => {
	const query = req.query;
	mergeFieldsHeaderIntoQuery(req.headers, query, MEET_MEETING_EXTRA_FIELDS, 'extraFields');

	const { success, error, data } = GetMeetingQuerySchema.safeParse(query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	res.locals.validatedQuery = data;
	next();
};

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

export const validateWaitingParticipantLeaveReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = WaitingParticipantLeaveReqSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	res.locals.validatedQuery = data;
	next();
};

export const validateBulkRejectWaitingParticipantsReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = BulkRejectWaitingParticipantsReqSchema.safeParse(req.query);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	res.locals.validatedQuery = data;
	next();
};
