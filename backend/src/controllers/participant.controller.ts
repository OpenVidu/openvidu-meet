import { ParticipantOptions } from '@typings-ce';
import { Request, Response } from 'express';
import { container } from '../config/index.js';
import INTERNAL_CONFIG from '../config/internal-config.js';
import { MEET_PARTICIPANT_TOKEN_EXPIRATION } from '../environment.js';
import { OpenViduMeetError } from '../models/error.model.js';
import { LoggerService, ParticipantService, RoomService, TokenService } from '../services/index.js';
import { getCookieOptions } from '../utils/cookie-utils.js';

export const generateParticipantToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const participantService = container.get(ParticipantService);
	const roomService = container.get(RoomService);
	const participantOptions: ParticipantOptions = req.body;
	const { roomId } = participantOptions;

	try {
		logger.verbose(`Generating participant token for room ${roomId}`);
		await roomService.createLivekitRoom(roomId);
		const token = await participantService.generateOrRefreshParticipantToken(participantOptions);

		res.cookie(
			INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME,
			token,
			getCookieOptions('/', MEET_PARTICIPANT_TOKEN_EXPIRATION)
		);
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

	const participantOptions: ParticipantOptions = req.body;
	const { roomId } = participantOptions;
	const participantService = container.get(ParticipantService);

	try {
		logger.verbose(`Refreshing participant token for room ${roomId}`);
		const token = await participantService.generateOrRefreshParticipantToken(participantOptions, true);

		res.cookie(
			INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME,
			token,
			getCookieOptions('/', MEET_PARTICIPANT_TOKEN_EXPIRATION)
		);
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
	const { roomId, participantName } = req.params;

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
