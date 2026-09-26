import type { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { errorBroadcastDisabled, handleError, rejectRequestFromMeetError } from '../models/error.model.js';
import { RoomService } from '../services/room.service.js';

/**
 * Middleware to ensure the room allows live broadcasts before one is started.
 */
export const withBroadcastEnabled = async (req: Request, res: Response, next: NextFunction) => {
	const roomService = container.get(RoomService);
	const roomId = req.params.roomId as string;

	try {
		const { config } = await roomService.getMeetRoom(roomId, ['config']);

		if (!config.broadcast.enabled) {
			return rejectRequestFromMeetError(res, errorBroadcastDisabled(roomId));
		}

		return next();
	} catch (error) {
		handleError(res, error, `checking broadcast config of room '${roomId}'`);
	}
};
