import { Request, Response } from 'express';
import { container } from '../config/index.js';
import { handleError } from '../models/error.model.js';
import { LiveKitService, LoggerService, RoomService } from '../services/index.js';

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
