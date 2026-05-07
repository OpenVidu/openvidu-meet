import type { NextFunction, Request, Response } from 'express';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import { AssistantIdSchema, CreateAssistantReqSchema } from '../../models/zod-schemas/ai-assistant.schema.js';

export const validateCreateAssistantReq = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = CreateAssistantReqSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};

export const validateAssistantIdPathParam = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = AssistantIdSchema.safeParse(req.params.assistantId);

	if (!success) {
		error.errors[0].path = ['assistantId'];
		return rejectUnprocessableRequest(res, error);
	}

	req.params.assistantId = data;
	next();
};
