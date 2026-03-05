import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { errorInsufficientPermissions, handleError, rejectRequestFromMeetError } from '../models/error.model.js';
import { AiAssistantService } from '../services/ai-assistant.service.js';
import { LoggerService } from '../services/logger.service.js';
import { RequestSessionService } from '../services/request-session.service.js';

export const createAssistant = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const requestSessionService = container.get(RequestSessionService);
	const aiAssistantService = container.get(AiAssistantService);
	// const payload: MeetCreateAssistantRequest = req.body;

	const roomId = requestSessionService.getRoomIdFromMember();
	const participantIdentity = requestSessionService.getParticipantIdentity();

	if (!roomId || !participantIdentity) {
		logger.warn('Could not resolve room or participant identity from token when creating assistant');
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	try {
		logger.verbose(`Creating assistant for participant '${participantIdentity}' in room '${roomId}'`);
		const assistant = await aiAssistantService.createLiveCaptionsAssistant(roomId, participantIdentity);
		return res.status(200).json(assistant);
	} catch (error) {
		handleError(res, error, `creating assistant in room '${roomId}'`);
	}
};

export const cancelAssistant = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const requestSessionService = container.get(RequestSessionService);
	const aiAssistantService = container.get(AiAssistantService);
	const { assistantId } = req.params;

	const roomId = requestSessionService.getRoomIdFromMember();
	const participantIdentity = requestSessionService.getParticipantIdentity();

	if (!roomId || !participantIdentity) {
		logger.warn('Could not resolve room or participant identity from token when canceling assistant');
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	try {
		logger.verbose(
			`Canceling assistant '${assistantId}' for participant '${participantIdentity}' in room '${roomId}'`
		);
		await aiAssistantService.cancelAssistant(assistantId, roomId, participantIdentity);
		return res.status(204).send();
	} catch (error) {
		handleError(res, error, `canceling assistant '${assistantId}' in room '${roomId}'`);
	}
};
