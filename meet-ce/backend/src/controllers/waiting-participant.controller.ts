import type { MeetWaitingParticipantBulkRejectResponse, MeetWaitingParticipantReason } from '@openvidu-meet/typings';
import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { handleError } from '../middlewares/error-handler.middleware.js';
import { LoggerService } from '../services/logger.service.js';
import { WaitingParticipantService } from '../services/waiting-participants/waiting-participant.service.js';

export const getWaitingParticipants = async (req: Request, res: Response) => {
	const waitingParticipantService = container.get(WaitingParticipantService);
	const { roomId } = req.params as Record<string, string>;

	try {
		const waitingParticipants = await waitingParticipantService.list(roomId);
		res.status(200).json(waitingParticipants);
	} catch (error) {
		handleError(res, error, `listing the waiting participants of room '${roomId}'`);
	}
};

export const getWaitingParticipant = async (req: Request, res: Response) => {
	const waitingParticipantService = container.get(WaitingParticipantService);
	const { roomId, participantIdentity } = req.params as Record<string, string>;

	try {
		const participant = await waitingParticipantService.get(roomId, participantIdentity);
		res.status(200).json(participant);
	} catch (error) {
		handleError(res, error, `getting waiting participant '${participantIdentity}' of room '${roomId}'`);
	}
};

export const admitWaitingParticipant = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const waitingParticipantService = container.get(WaitingParticipantService);
	const { roomId, participantIdentity } = req.params as Record<string, string>;

	try {
		logger.info(`Admitting waiting participant '${participantIdentity}' in room '${roomId}'`);
		await waitingParticipantService.admit(roomId, participantIdentity);
		res.status(200).json({ message: `Participant '${participantIdentity}' admitted to room '${roomId}'` });
	} catch (error) {
		handleError(res, error, `admitting waiting participant '${participantIdentity}' in room '${roomId}'`);
	}
};

export const admitAllWaitingParticipants = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const waitingParticipantService = container.get(WaitingParticipantService);
	const { roomId } = req.params as Record<string, string>;

	try {
		logger.info(`Admitting every waiting participant in room '${roomId}'`);
		await waitingParticipantService.admit(roomId);
		res.status(200).json({ message: `Waiting participants admitted to room '${roomId}'` });
	} catch (error) {
		handleError(res, error, `admitting every waiting participant in room '${roomId}'`);
	}
};

export const rejectWaitingParticipant = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const waitingParticipantService = container.get(WaitingParticipantService);
	const { roomId, participantIdentity } = req.params as Record<string, string>;

	try {
		logger.info(`Rejecting waiting participant '${participantIdentity}' in room '${roomId}'`);
		await waitingParticipantService.reject(roomId, participantIdentity);
		res.status(200).json({ message: `Participant '${participantIdentity}' rejected from room '${roomId}'` });
	} catch (error) {
		handleError(res, error, `rejecting waiting participant '${participantIdentity}' in room '${roomId}'`);
	}
};

export const bulkRejectWaitingParticipants = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const waitingParticipantService = container.get(WaitingParticipantService);
	const { roomId } = req.params as Record<string, string>;
	const { participantIdentities } = res.locals.validatedQuery as { participantIdentities: string[] };

	try {
		logger.info(`Rejecting waiting participants ${String(participantIdentities)} in room '${roomId}'`);
		const { rejected, failed } = await waitingParticipantService.bulkReject(roomId, participantIdentities);
		const response: MeetWaitingParticipantBulkRejectResponse = {
			message:
				failed.length === 0
					? 'All waiting participants rejected successfully'
					: `${failed.length} waiting participant(s) could not be rejected`,
			deleted: rejected,
			failed
		};
		res.status(failed.length === 0 ? 200 : 400).json(response);
	} catch (error) {
		handleError(res, error, `bulk rejecting waiting participants in room '${roomId}'`);
	}
};

export const leaveWaiting = async (req: Request, res: Response) => {
	const waitingParticipantService = container.get(WaitingParticipantService);
	const { roomId } = req.params as Record<string, string>;
	const { waitingTicket, reason } = res.locals.validatedQuery as {
		waitingTicket: string;
		reason?: MeetWaitingParticipantReason.PAGE_CLOSED;
	};

	try {
		await waitingParticipantService.leave(roomId, waitingTicket, reason);
		res.status(204).end();
	} catch (error) {
		handleError(res, error, `leaving the wait to join room '${roomId}'`);
	}
};
