import { TokenOptions } from '@typings-ce';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { nonEmptySanitizedRoomId } from './room-validator.middleware.js';

const ParticipantTokenRequestSchema: z.ZodType<TokenOptions> = z.object({
	roomId: nonEmptySanitizedRoomId('roomId'),
	participantName: z.string().nonempty('Participant name is required'),
	secret: z.string().nonempty('Secret is required')
});

export const validateParticipantTokenRequest = (req: Request, res: Response, next: NextFunction) => {
	const { success, error, data } = ParticipantTokenRequestSchema.safeParse(req.body);

	if (!success) {
		return rejectRequest(res, error);
	}

	req.body = data;
	next();
};

const rejectRequest = (res: Response, error: z.ZodError) => {
	const errors = error.errors.map((error) => ({
		field: error.path.join('.'),
		message: error.message
	}));

	console.log(errors);

	return res.status(422).json({
		error: 'Unprocessable Entity',
		message: 'Invalid request',
		details: errors
	});
};
