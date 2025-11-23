import { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import { UpdateParticipantRoleReqSchema } from '../../models/zod-schemas/meeting.schema.js';

export const validateUpdateParticipantRoleReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = UpdateParticipantRoleReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
