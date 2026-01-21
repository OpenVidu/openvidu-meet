import { MeetUserRole } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import {
	errorInsufficientPermissions,
	errorRoomNotFound,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { RoomService } from '../services/room.service.js';

/**
 * Middleware to authorize access to a room.
 *
 * - If a Room Member Token is used, it checks that the token's roomId matches the requested roomId.
 * - If a registered user is authenticated, it checks their role and whether they are the owner or a member of the room.
 * - If neither a valid token nor an authenticated user is present, it rejects the request.
 */
export const authorizeRoomAccess = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = req.params.roomId as string;

	const roomService = container.get(RoomService);
	const roomExists = await roomService.meetRoomExists(roomId);

	// Fail fast if room does not exist
	if (!roomExists) {
		const error = errorRoomNotFound(roomId);
		return rejectRequestFromMeetError(res, error);
	}

	const requestSessionService = container.get(RequestSessionService);
	const memberRoomId = requestSessionService.getRoomIdFromMember();
	const user = requestSessionService.getAuthenticatedUser();

	const forbiddenError = errorInsufficientPermissions();

	// Room Member Token
	if (memberRoomId) {
		// Check if the member's roomId matches the requested roomId
		if (memberRoomId !== roomId) {
			return rejectRequestFromMeetError(res, forbiddenError);
		}

		return next();
	}

	// Registered User
	if (user) {
		try {
			const canAccess = await roomService.canUserAccessRoom(roomId, user);

			if (!canAccess) {
				return rejectRequestFromMeetError(res, forbiddenError);
			}

			return next();
		} catch (error) {
			return handleError(res, error, 'checking user access to room');
		}
	}

	// If there is no token and no user, reject the request
	return rejectRequestFromMeetError(res, forbiddenError);
};

/**
 * Middleware to authorize management of a room.
 *
 * - Checks if the authenticated user is an admin or the owner of the room.
 */
export const authorizeRoomManagement = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = req.params.roomId as string;

	const roomService = container.get(RoomService);
	const roomExists = await roomService.meetRoomExists(roomId);

	// Fail fast if room does not exist
	if (!roomExists) {
		const error = errorRoomNotFound(roomId);
		return rejectRequestFromMeetError(res, error);
	}

	const requestSessionService = container.get(RequestSessionService);
	const user = requestSessionService.getAuthenticatedUser();

	const forbiddenError = errorInsufficientPermissions();

	if (!user) {
		return rejectRequestFromMeetError(res, forbiddenError);
	}

	if (user.role === MeetUserRole.ADMIN) {
		return next();
	}

	try {
		const isOwner = await roomService.isRoomOwner(roomId, user.userId);

		if (isOwner) {
			return next();
		}

		return rejectRequestFromMeetError(res, forbiddenError);
	} catch (error) {
		return handleError(res, error, 'checking room ownership');
	}
};
