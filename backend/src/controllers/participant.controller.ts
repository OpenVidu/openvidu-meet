import { container } from '../config/dependency-injector.config.js';
import { Request, Response } from 'express';
import { LoggerService } from '../services/logger.service.js';
import { TokenOptions } from '@typings-ce';
import { OpenViduMeetError } from '../models/index.js';
import { ParticipantService } from '../services/participant.service.js';
import { MEET_PARTICIPANT_TOKEN_EXPIRATION, PARTICIPANT_TOKEN_COOKIE_NAME } from '../environment.js';
import { getCookieOptions } from '../utils/cookie-utils.js';
import { TokenService } from '../services/token.service.js';

export const generateParticipantToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const tokenOptions: TokenOptions = req.body;
	const { roomName } = tokenOptions;
	const participantService = container.get(ParticipantService);

	try {
		logger.verbose(`Generating participant token for room ${roomName}`);
		const token = await participantService.generateOrRefreshParticipantToken(tokenOptions);

		res.cookie(PARTICIPANT_TOKEN_COOKIE_NAME, token, getCookieOptions('/', MEET_PARTICIPANT_TOKEN_EXPIRATION));
		logger.verbose(`Participant token generated for room ${roomName}`);
		return res.status(200).json({ token });
	} catch (error) {
		logger.error(`Error generating participant token for room: ${roomName}`);
		return handleError(res, error);
	}
};

export const refreshParticipantToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	// Check if there is a previous token and if it is valid
	const previousToken = req.cookies[PARTICIPANT_TOKEN_COOKIE_NAME];

	if (previousToken) {
		logger.verbose('Previous participant token found. Checking validity');
		const tokenService = container.get(TokenService);

		try {
			await tokenService.verifyToken(previousToken);
			logger.verbose('Previous participant token is valid. No need to refresh');
			return res.status(409).json({ message: 'Participant token is still valid' });
		} catch (error) {
			logger.verbose('Previous participant token is invalid');
		}
	}

	const tokenOptions: TokenOptions = req.body;
	const { roomName } = tokenOptions;
	const participantService = container.get(ParticipantService);

	try {
		logger.verbose(`Refreshing participant token for room ${roomName}`);
		const token = await participantService.generateOrRefreshParticipantToken(tokenOptions, true);

		res.cookie(PARTICIPANT_TOKEN_COOKIE_NAME, token, getCookieOptions('/', MEET_PARTICIPANT_TOKEN_EXPIRATION));
		logger.verbose(`Participant token refreshed for room ${roomName}`);
		return res.status(200).json({ token });
	} catch (error) {
		logger.error(`Error refreshing participant token for room: ${roomName}`);
		return handleError(res, error);
	}
};

export const deleteParticipant = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const participantService = container.get(ParticipantService);
	const { participantName } = req.params;
	const roomName: string = req.query.roomName as string;

	try {
		await participantService.deleteParticipant(participantName, roomName);
		res.status(200).json({ message: 'Participant deleted' });
	} catch (error) {
		logger.error(`Error deleting participant from room: ${roomName}`);
		return handleError(res, error);
	}
};

const handleError = (res: Response, error: OpenViduMeetError | unknown) => {
	const logger = container.get(LoggerService);
	logger.error(String(error));

	if (error instanceof OpenViduMeetError) {
		res.status(error.statusCode).json({ name: error.name, message: error.message });
	} else {
		res.status(500).json({
			name: 'Participant Error',
			message: 'Internal server error. Participant operation failed'
		});
	}
};
