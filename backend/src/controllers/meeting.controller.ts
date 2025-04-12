import { container } from '../config/dependency-injector.config.js';
import { Request, Response } from 'express';
import { LoggerService } from '../services/logger.service.js';
import { OpenViduMeetError } from '../models/index.js';
import { LiveKitService } from '../services/livekit.service.js';

export const endMeeting = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const livekitService = container.get(LiveKitService);
	const { roomId } = req.params;

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
