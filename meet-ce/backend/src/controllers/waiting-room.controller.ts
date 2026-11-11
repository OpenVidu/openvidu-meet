import type { MeetWaitingRoomDecisionOptions } from '@openvidu-meet/typings';
import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { handleError } from '../middlewares/error-handler.middleware.js';
import { WaitingRoomService } from '../services/waiting-room/waiting-room.service.js';
import { LoggerService } from '../services/logger.service.js';

export const getWaitingRoom = async (req: Request, res: Response) => {
	const waitingRoomService = container.get(WaitingRoomService);
	const { roomId } = req.params as Record<string, string>;

	try {
		const waitingRoom = await waitingRoomService.list(roomId);
		res.status(200).json(waitingRoom);
	} catch (error) {
		handleError(res, error, `listing the waiting room of room '${roomId}'`);
	}
};

export const admitFromWaitingRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const waitingRoomService = container.get(WaitingRoomService);
	const { roomId } = req.params as Record<string, string>;
	const { participantIdentities } = req.body as MeetWaitingRoomDecisionOptions;

	try {
		logger.info(`Admitting ${participantIdentities?.length ?? 'every'} waiting participant(s) in room '${roomId}'`);
		const participants = await waitingRoomService.admit(roomId, participantIdentities);
		res.status(200).json({ participants });
	} catch (error) {
		handleError(res, error, `admitting waiting participants in room '${roomId}'`);
	}
};

export const rejectFromWaitingRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const waitingRoomService = container.get(WaitingRoomService);
	const { roomId } = req.params as Record<string, string>;
	const { participantIdentities } = req.body as MeetWaitingRoomDecisionOptions;

	try {
		logger.info(`Rejecting ${participantIdentities?.length ?? 'every'} waiting participant(s) in room '${roomId}'`);
		const participants = await waitingRoomService.reject(roomId, participantIdentities);
		res.status(200).json({ participants });
	} catch (error) {
		handleError(res, error, `rejecting waiting participants in room '${roomId}'`);
	}
};

export const leaveWaitingRoom = async (req: Request, res: Response) => {
	const waitingRoomService = container.get(WaitingRoomService);
	const { roomId } = req.params as Record<string, string>;
	const { waitingRoomTicket } = res.locals.validatedQuery as { waitingRoomTicket: string };

	try {
		await waitingRoomService.leave(roomId, waitingRoomTicket);
		res.status(204).end();
	} catch (error) {
		handleError(res, error, `leaving the waiting room of room '${roomId}'`);
	}
};
