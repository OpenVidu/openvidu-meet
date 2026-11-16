import type { MeetBroadcastStartOptions } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { BroadcastHelper } from '../helpers/broadcast.helper.js';
import { errorBroadcastDisabled, errorInsufficientPermissions, OpenViduMeetError } from '../models/error.model.js';
import { RoomAccessService } from '../services/room-access.service.js';
import { RoomService } from '../services/room.service.js';
import { handleError, rejectRequestFromMeetError } from './error-handler.middleware.js';
import { isTokenOfAnotherRoom, withRoomPermission } from './room.middleware.js';

/** The room a start request names in its body. */
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

/** Why the caller may not control the broadcasts of the room, or nothing when they may. */
const broadcastControlRefusal = async (roomId: string): Promise<string | undefined> => {
	if (isTokenOfAnotherRoom(roomId)) return errorInsufficientPermissions().message;

	try {
		const permissions = await container.get(RoomAccessService).getAuthenticatedRoomMemberPermissions(roomId);
		return permissions.broadcastControl ? undefined : errorInsufficientPermissions().message;
	} catch (error) {
		if (error instanceof OpenViduMeetError) return error.message;

		throw error;
	}
};

/**
 * Middleware to check `broadcastControl` in the room of each broadcast a bulk stop names: the ones the
 * caller may not stop are reported as failed instead of failing the whole request.
 */
export const withBroadcastControlOfEach = async (_req: Request, res: Response, next: NextFunction) => {
	const { broadcastIds } = res.locals.validatedQuery as { broadcastIds: string[] };
	const roomIds = [...new Set(broadcastIds.map((broadcastId) => BroadcastHelper.roomIdOf(broadcastId)))];

	try {
		const refusals = new Map(
			await Promise.all(roomIds.map(async (roomId) => [roomId, await broadcastControlRefusal(roomId)] as const))
		);
		const processableIds: string[] = [];
		const failed: { broadcastId: string; error: string }[] = [];

		for (const broadcastId of broadcastIds) {
			const error = refusals.get(BroadcastHelper.roomIdOf(broadcastId));

			if (error) {
				failed.push({ broadcastId, error });
			} else {
				processableIds.push(broadcastId);
			}
		}

		res.locals.bulkValidation = { processableIds, failed };
		return next();
	} catch (error) {
		handleError(res, error, 'checking broadcast permissions');
	}
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
