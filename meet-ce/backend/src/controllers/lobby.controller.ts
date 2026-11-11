import type { MeetLobbyDecisionOptions } from '@openvidu-meet/typings';
import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { handleError } from '../middlewares/error-handler.middleware.js';
import { LobbyService } from '../services/lobby/lobby.service.js';
import { LoggerService } from '../services/logger.service.js';

export const getLobby = async (req: Request, res: Response) => {
	const lobbyService = container.get(LobbyService);
	const { roomId } = req.params as Record<string, string>;

	try {
		const lobby = await lobbyService.list(roomId);
		res.status(200).json(lobby);
	} catch (error) {
		handleError(res, error, `listing the waiting room of room '${roomId}'`);
	}
};

export const admitFromLobby = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const lobbyService = container.get(LobbyService);
	const { roomId } = req.params as Record<string, string>;
	const { participantIdentities } = req.body as MeetLobbyDecisionOptions;

	try {
		logger.info(`Admitting ${participantIdentities?.length ?? 'every'} waiting participant(s) in room '${roomId}'`);
		const participants = await lobbyService.admit(roomId, participantIdentities);
		res.status(200).json({ participants });
	} catch (error) {
		handleError(res, error, `admitting waiting participants in room '${roomId}'`);
	}
};

export const rejectFromLobby = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const lobbyService = container.get(LobbyService);
	const { roomId } = req.params as Record<string, string>;
	const { participantIdentities } = req.body as MeetLobbyDecisionOptions;

	try {
		logger.info(`Rejecting ${participantIdentities?.length ?? 'every'} waiting participant(s) in room '${roomId}'`);
		const participants = await lobbyService.reject(roomId, participantIdentities);
		res.status(200).json({ participants });
	} catch (error) {
		handleError(res, error, `rejecting waiting participants in room '${roomId}'`);
	}
};

export const leaveLobby = async (req: Request, res: Response) => {
	const lobbyService = container.get(LobbyService);
	const { roomId } = req.params as Record<string, string>;
	const { lobbyTicket } = res.locals.validatedQuery as { lobbyTicket: string };

	try {
		await lobbyService.leave(roomId, lobbyTicket);
		res.status(204).end();
	} catch (error) {
		handleError(res, error, `leaving the waiting room of room '${roomId}'`);
	}
};
