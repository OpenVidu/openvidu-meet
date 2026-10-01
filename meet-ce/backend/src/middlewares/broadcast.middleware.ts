import type { MeetBroadcastStartOptions } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { errorBroadcastDisabled, handleError, rejectRequestFromMeetError } from '../models/error.model.js';
import { RoomService } from '../services/room.service.js';
import { withRoomPermission } from './room.middleware.js';

/**
 * Middleware to require `broadcastAddDestinations` from a start request that adds a destination for
 * the meeting, which is any entry without the `id` of a room destination.
 */
export const withAddDestinationsPermissionToStart = (req: Request, res: Response, next: NextFunction) => {
	const { destinations } = req.body as MeetBroadcastStartOptions;

	if (!destinations?.some(({ id }) => !id)) return next();

	return withRoomPermission('broadcastAddDestinations')(req, res, next);
};

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
