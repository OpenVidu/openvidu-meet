import { AuthMode, MeetRecordingAccess, MeetRoom, ParticipantRole, UserRole } from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/index.js';
import {
	errorInsufficientPermissions,
	errorRoomMetadataNotFound,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { MeetStorageService, RoomService } from '../services/index.js';
import { allowAnonymous, tokenAndRoleValidator, withAuth } from './auth.middleware.js';

/**
 * Middleware that configures authorization for accessing a specific room.
 *
 * - If there is no token in the session, the user is granted access (admin or API key).
 * - If the user does not belong to the requested room, access is denied.
 * - Otherwise, the user is allowed to access the room.
 */
export const configureRoomAuthorization = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = req.params.roomId as string;
	const payload = req.session?.tokenClaims;

	// If there is no token, the user is admin or it is invoked using the API key
	// In this case, the user is allowed to access the resource
	if (!payload) {
		return next();
	}

	const sameRoom = payload.video?.room === roomId;

	// If the user does not belong to the requested room, access is denied
	if (!sameRoom) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	return next();
};

/**
 * Middleware to configure authentication based on participant role and authentication mode to access a room
 * for generating a token for retrieving/deleting recordings.
 *
 * - If the authentication mode is MODERATORS_ONLY and the participant role is MODERATOR, configure user authentication.
 * - If the authentication mode is ALL_USERS, configure user authentication.
 * - Otherwise, allow anonymous access.
 */
export const configureRecordingTokenAuth = async (req: Request, res: Response, next: NextFunction) => {
	const storageService = container.get(MeetStorageService);
	const roomService = container.get(RoomService);

	let role: ParticipantRole;

	try {
		const roomId = req.params.roomId;
		const { secret } = req.body;
		const room = await storageService.getArchivedRoomMetadata(roomId);

		if (!room) {
			// If the room is not found, it means that there are no recordings for that room or the room doesn't exist
			throw errorRoomMetadataNotFound(roomId);
		}

		const recordingAccess = room.config?.recording.allowAccessTo;

		if (!recordingAccess || recordingAccess === MeetRecordingAccess.ADMIN) {
			// Deny request if the room is configured to allow access to recordings only for admins
			throw errorInsufficientPermissions();
		}

		role = roomService.getRoomRoleBySecretFromRoom(room as MeetRoom, secret);
	} catch (error) {
		return handleError(res, error, 'getting room role by secret');
	}

	let authModeToAccessRoom: AuthMode;

	try {
		const { securityPreferences } = await storageService.getGlobalPreferences();
		authModeToAccessRoom = securityPreferences.authentication.authModeToAccessRoom;
	} catch (error) {
		return handleError(res, error, 'checking authentication preferences');
	}

	const authValidators = [];

	if (authModeToAccessRoom === AuthMode.NONE) {
		authValidators.push(allowAnonymous);
	} else {
		const isModeratorsOnlyMode =
			authModeToAccessRoom === AuthMode.MODERATORS_ONLY && role === ParticipantRole.MODERATOR;
		const isAllUsersMode = authModeToAccessRoom === AuthMode.ALL_USERS;

		if (isModeratorsOnlyMode || isAllUsersMode) {
			authValidators.push(tokenAndRoleValidator(UserRole.USER));
		} else {
			authValidators.push(allowAnonymous);
		}
	}

	return withAuth(...authValidators)(req, res, next);
};
