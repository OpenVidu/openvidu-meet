import { Request, Response } from 'express';
import { container } from '../config/index.js';
import { OpenViduMeetError } from '../models/error.model.js';
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
		logger.error(`Error getting room '${roomId}'`);
		return handleError(res, error);
	}

	try {
		// To end a meeting, we need to delete the room from LiveKit
		await livekitService.deleteRoom(roomId);
		res.status(200).json({ message: 'Meeting ended successfully' });
	} catch (error) {
		logger.error(`Error ending meeting from room: ${roomId}`);
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
			name: 'Meeting Error',
			message: 'Internal server error. Meeting operation failed'
		});
	}
};
