import { Request, Response } from 'express';
import { container } from '../config/index.js';
import { handleError } from '../models/error.model.js';
import { LiveKitService, LoggerService, RoomMemberService, RoomService } from '../services/index.js';

export const endMeeting = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const livekitService = container.get(LiveKitService);

	const { roomId } = req.params;

	// Check if the room exists
	try {
		await roomService.getMeetRoom(roomId);
	} catch (error) {
		return handleError(res, error, `getting room '${roomId}'`);
	}

	try {
		logger.info(`Ending meeting from room '${roomId}'`);
		// To end a meeting, we need to delete the room from LiveKit
		await livekitService.deleteRoom(roomId);
		res.status(200).json({ message: `Meeting in room '${roomId}' ended successfully` });
	} catch (error) {
		handleError(res, error, `ending meeting from room '${roomId}'`);
	}
};

export const updateParticipantRole = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomMemberService = container.get(RoomMemberService);
	const { roomId, participantIdentity } = req.params;
	const { role } = req.body;

	try {
		logger.verbose(`Changing role of participant '${participantIdentity}' in room '${roomId}' to '${role}'`);
		await roomMemberService.updateParticipantRole(roomId, participantIdentity, role);
		res.status(200).json({ message: `Participant '${participantIdentity}' role updated to '${role}'` });
	} catch (error) {
		handleError(res, error, `changing role for participant '${participantIdentity}' in room '${roomId}'`);
	}
};

export const kickParticipantFromMeeting = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const roomMemberService = container.get(RoomMemberService);
	const { roomId, participantIdentity } = req.params;

	// Check if the room exists
	try {
		await roomService.getMeetRoom(roomId);
	} catch (error) {
		return handleError(res, error, `getting room '${roomId}'`);
	}

	try {
		logger.verbose(`Kicking participant '${participantIdentity}' from room '${roomId}'`);
		await roomMemberService.kickParticipantFromMeeting(roomId, participantIdentity);
		res.status(200).json({
			message: `Participant '${participantIdentity}' kicked successfully from meeting in room '${roomId}'`
		});
	} catch (error) {
		handleError(res, error, `kicking participant '${participantIdentity}' from meeting in room '${roomId}'`);
	}
};
