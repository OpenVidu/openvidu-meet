import { container } from '../config/dependency-injector.config.js';
import { Request, Response } from 'express';
import { LoggerService } from '../services/logger.service.js';
import { TokenOptions } from '@typings-ce';
import { OpenViduMeetError } from '../models/index.js';
import { ParticipantService } from '../services/participant.service.js';
import { MEET_PARTICIPANT_TOKEN_EXPIRATION } from '../environment.js';
import { getCookieOptions } from '../utils/cookie-utils.js';
import { TokenService } from '../services/token.service.js';
import { RoomService } from '../services/room.service.js';
import INTERNAL_CONFIG from '../config/internal-config.js';

export const generateParticipantToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const participantService = container.get(ParticipantService);
	const roomService = container.get(RoomService);
	const tokenOptions: TokenOptions = req.body;
	const { roomId } = tokenOptions;

	try {
		logger.verbose(`Generating participant token for room ${roomId}`);
		await roomService.createLivekitRoom(roomId);
		const token = await participantService.generateOrRefreshParticipantToken(tokenOptions);

		res.cookie(INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME, token, getCookieOptions('/', MEET_PARTICIPANT_TOKEN_EXPIRATION));
		return res.status(200).json({ token });
	} catch (error) {
		logger.error(`Error generating participant token for room: ${roomId}`);
		return handleError(res, error);
	}
};

export const refreshParticipantToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	// Check if there is a previous token and if it is valid
	const previousToken = req.cookies[INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME];

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
	const { roomId } = tokenOptions;
	const participantService = container.get(ParticipantService);

	try {
		logger.verbose(`Refreshing participant token for room ${roomId}`);
		const token = await participantService.generateOrRefreshParticipantToken(tokenOptions, true);

		res.cookie(INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME, token, getCookieOptions('/', MEET_PARTICIPANT_TOKEN_EXPIRATION));
		logger.verbose(`Participant token refreshed for room ${roomId}`);
		return res.status(200).json({ token });
	} catch (error) {
		logger.error(`Error refreshing participant token for room: ${roomId}`);
		return handleError(res, error);
	}
};

export const deleteParticipant = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const participantService = container.get(ParticipantService);
	const { participantName } = req.params;
	const roomId: string = req.query.roomId as string;

	try {
		await participantService.deleteParticipant(participantName, roomId);
		res.status(200).json({ message: 'Participant deleted' });
	} catch (error) {
		logger.error(`Error deleting participant from room: ${roomId}`);
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
