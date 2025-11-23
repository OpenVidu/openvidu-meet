import { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { errorInsufficientPermissions, rejectRequestFromMeetError } from '../models/error.model.js';
import { RequestSessionService } from '../services/request-session.service.js';

/**
 * Middleware that configures authorization for accessing a specific room.
 *
 * - If there is no token in the session, the user is granted access (admin or API key).
 * - If the user does not belong to the requested room, access is denied.
 * - Otherwise, the user is allowed to access the room.
 */
export const configureRoomAuthorization = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = req.params.roomId as string;

	const requestSessionService = container.get(RequestSessionService);
	const tokenRoomId = requestSessionService.getRoomIdFromToken();

	// If there is no token, the user is admin or it is invoked using the API key
	// In this case, the user is allowed to access the resource
	if (!tokenRoomId) {
		return next();
	}

	// If the user does not belong to the requested room, access is denied
	if (tokenRoomId !== roomId) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	return next();
};
