import { ParticipantOptions } from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { rejectUnprocessableRequest } from '../../models/error.model.js';
import { nonEmptySanitizedRoomId } from './room-validator.middleware.js';

const ParticipantTokenRequestSchema: z.ZodType<ParticipantOptions> = z.object({
	roomId: nonEmptySanitizedRoomId('roomId'),
	secret: z.string().nonempty('Secret is required'),
	participantName: z.string().optional()
});

export const validateParticipantTokenRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = ParticipantTokenRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectUnprocessableRequest(res, error);
	}

	req.body = data;
	next();
};
