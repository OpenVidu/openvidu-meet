import type { MeetBroadcastStartOptions } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { BroadcastHelper } from '../helpers/broadcast.helper.js';
import { errorBroadcastDisabled, handleError, rejectRequestFromMeetError } from '../models/error.model.js';
import { RoomService } from '../services/room.service.js';
import { withRoomPermission } from './room.middleware.js';

/** The room a start or stop request names in its body. */
export const bodyRoomId = (req: Request) => (req.body as { roomId: string }).roomId;

/** The room a list request names in its query. */
export const queryRoomId = (_req: Request, res: Response) => (res.locals.validatedQuery as { roomId: string }).roomId;

/** The room a broadcast belongs to, which its id names. */
export const broadcastRoomId = (req: Request) => BroadcastHelper.roomIdOf(req.params.broadcastId as string);

/**
 * Middleware to require `broadcastEdit` from a start request that streams to a
 * destination given for the meeting.
 */
export const withEditPermissionToStart = (req: Request, res: Response, next: NextFunction) => {
	const { destinations } = req.body as MeetBroadcastStartOptions;

	if (!destinations?.length) return next();

	return withRoomPermission('broadcastEdit', bodyRoomId)(req, res, next);
};

/**
 * Middleware to ensure the room allows live broadcasts before one is started.
 */
export const withBroadcastEnabled = async (req: Request, res: Response, next: NextFunction) => {
	const roomService = container.get(RoomService);
	const roomId = bodyRoomId(req);

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
