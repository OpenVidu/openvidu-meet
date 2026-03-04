import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { handleError } from '../models/error.model.js';
import { AiAssistantService } from '../services/ai-assistant.service.js';
import { LoggerService } from '../services/logger.service.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { TokenService } from '../services/token.service.js';
import { getRoomMemberToken } from '../utils/token.utils.js';

const getRoomMemberIdentityFromRequest = async (req: Request): Promise<string> => {
	const tokenService = container.get(TokenService);
	const token = getRoomMemberToken(req);

	if (!token) {
		throw new Error('Room member token not found');
	}

	const claims = await tokenService.verifyToken(token);

	if (!claims.sub) {
		throw new Error('Room member token does not include participant identity');
	}

	return claims.sub;
};

export const createAssistant = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const requestSessionService = container.get(RequestSessionService);
	const aiAssistantService = container.get(AiAssistantService);
	// const payload: MeetCreateAssistantRequest = req.body;
	const roomId = requestSessionService.getRoomIdFromToken();

	if (!roomId) {
		return handleError(res, new Error('Could not resolve room from token'), 'creating assistant');
	}

	try {
		const participantIdentity = await getRoomMemberIdentityFromRequest(req);
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
	const roomId = requestSessionService.getRoomIdFromToken();

	if (!roomId) {
		return handleError(res, new Error('Could not resolve room from token'), 'canceling assistant');
	}

	try {
		const participantIdentity = await getRoomMemberIdentityFromRequest(req);
		logger.verbose(
			`Canceling assistant '${assistantId}' for participant '${participantIdentity}' in room '${roomId}'`
		);
		await aiAssistantService.cancelAssistant(assistantId, roomId, participantIdentity);
		return res.status(204).send();
	} catch (error) {
		handleError(res, error, `canceling assistant '${assistantId}' in room '${roomId}'`);
	}
};
