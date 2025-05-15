import { ParticipantOptions } from '@typings-ce';
import { Request, Response } from 'express';
import { container } from '../config/index.js';
import INTERNAL_CONFIG from '../config/internal-config.js';
import { MEET_PARTICIPANT_TOKEN_EXPIRATION } from '../environment.js';
import { errorParticipantTokenStillValid, handleError, rejectRequestFromMeetError } from '../models/error.model.js';
import { LoggerService, ParticipantService, RoomService, TokenService } from '../services/index.js';
import { getCookieOptions } from '../utils/cookie-utils.js';

export const generateParticipantToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const participantService = container.get(ParticipantService);
	const roomService = container.get(RoomService);
	const participantOptions: ParticipantOptions = req.body;
	const { roomId } = participantOptions;

	try {
		logger.verbose(`Generating participant token for room '${roomId}'`);
		await roomService.createLivekitRoom(roomId);
		const token = await participantService.generateOrRefreshParticipantToken(participantOptions);

		res.cookie(
			INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME,
			token,
			getCookieOptions('/', MEET_PARTICIPANT_TOKEN_EXPIRATION)
		);
		return res.status(200).json({ token });
	} catch (error) {
		handleError(res, error, `generating participant token for room '${roomId}'`);
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

			const error = errorParticipantTokenStillValid();
			return rejectRequestFromMeetError(res, error);
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
		logger.verbose(`Participant token refreshed for room '${roomId}'`);
		return res.status(200).json({ token });
	} catch (error) {
		handleError(res, error, `refreshing participant token for room '${roomId}'`);
	}
};

export const deleteParticipant = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const participantService = container.get(ParticipantService);
	const { roomId, participantName } = req.params;

	// Check if the room exists
	try {
		await roomService.getMeetRoom(roomId);
	} catch (error) {
		return handleError(res, error, `getting room '${roomId}'`);
	}

	try {
		logger.verbose(`Deleting participant '${participantName}' from room '${roomId}'`);
		await participantService.deleteParticipant(participantName, roomId);
		res.status(200).json({ message: 'Participant deleted' });
	} catch (error) {
		handleError(res, error, `deleting participant '${participantName}' from room '${roomId}'`);
	}
};
