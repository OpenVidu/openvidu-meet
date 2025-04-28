import { AuthMode, MeetRecordingAccess, MeetRoom, ParticipantRole, UserRole } from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/index.js';
import {
	errorInsufficientPermissions,
	errorRoomNotFoundOrEmptyRecordings,
	OpenViduMeetError
} from '../models/error.model.js';
import { LoggerService, MeetStorageService, RoomService } from '../services/index.js';
import { allowAnonymous, apiKeyValidator, tokenAndRoleValidator, withAuth } from './auth.middleware.js';

/**
 * Middleware that configures authentication for creating a room based on global settings.
 *
 * - Admin role and API key authentication methods are always allowed.
 * - If room creation is allowed and requires authentication, the user must have a valid token.
 * - If room creation is allowed and does not require authentication, anonymous users are allowed.
 */
export const configureCreateRoomAuth = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);
	const globalPrefService = container.get(MeetStorageService);
	let allowRoomCreation: boolean;
	let requireAuthentication: boolean;

	try {
		const { securityPreferences } = await globalPrefService.getGlobalPreferences();
		({ allowRoomCreation, requireAuthentication } = securityPreferences.roomCreationPolicy);
	} catch (error) {
		logger.error('Error checking room creation policy:' + error);
		return res.status(500).json({ message: 'Internal server error' });
	}

	const authValidators = [apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)];

	if (allowRoomCreation) {
		if (requireAuthentication) {
			authValidators.push(tokenAndRoleValidator(UserRole.USER));
		} else {
			authValidators.push(allowAnonymous);
		}
	}

	return withAuth(...authValidators)(req, res, next);
};

/**
 * Middleware that configures authorization for accessing a specific room.
 *
 * This middleware runs after authentication and applies additional authorization rules
 * based on the user's role and global authentication settings.
 *
 * - If there is no token in the session, the user is granted access (admin or API key).
 * - If the user does not belong to the requested room, access is denied.
 * - If the user is a moderator and global authentication requires it,
 *   an extra validation step is added with `withAuth(tokenAndRoleValidator(UserRole.USER))`.
 * - If the user is not a moderator, access is denied.
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
	const metadata = JSON.parse(payload.metadata || '{}');
	const role = metadata.role as ParticipantRole;

	if (!sameRoom) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	const logger = container.get(LoggerService);
	const globalPrefService = container.get(MeetStorageService);
	let authMode: AuthMode;

	try {
		const { securityPreferences } = await globalPrefService.getGlobalPreferences();
		authMode = securityPreferences.authentication.authMode;
	} catch (error) {
		logger.error('Error checking authentication preferences', error);
		return res.status(500).json({ message: 'Internal server error' });
	}

	// If the user is a moderator, it is necessary to add the user role validator
	// in case the room requires some authentication
	if (role === ParticipantRole.MODERATOR) {
		if (authMode !== AuthMode.NONE) {
			return withAuth(tokenAndRoleValidator(UserRole.USER))(req, res, next);
		}

		return next();
	}

	// If the user is not a moderator, it is not allowed to access the resource
	return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
};

/**
 * Middleware to configure authentication based on participant role and authentication mode
 * for generating a token for retrieving/deleting recordings.
 *
 * - If the authentication mode is MODERATORS_ONLY and the participant role is MODERATOR, configure user authentication.
 * - If the authentication mode is ALL_USERS, configure user authentication.
 * - Otherwise, allow anonymous access.
 */
export const configureRecordingTokenAuth = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);
	const storageService = container.get(MeetStorageService);
	const roomService = container.get(RoomService);

	let role: ParticipantRole;

	try {
		const roomId = req.params.roomId;
		const { secret } = req.body;
		const room = await storageService.getArchivedRoomMetadata(roomId);

		if (!room) {
			// If the room is not found, it means that there are no recordings for that room or the room doesn't exist
			throw errorRoomNotFoundOrEmptyRecordings(roomId);
		}

		const recordingAccess = room.preferences!.recordingPreferences.allowAccessTo;

		if (recordingAccess === MeetRecordingAccess.ADMIN) {
			// Deny request if the room is configured to allow access to recordings only for admins
			throw errorInsufficientPermissions();
		}

		role = roomService.getRoomRoleBySecretFromRoom(room as MeetRoom, secret);
	} catch (error) {
		logger.error('Error getting room role by secret', error);

		if (error instanceof OpenViduMeetError) {
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		} else {
			return res.status(500).json({
				name: 'Room Error',
				message: 'Internal server error. Room operation failed'
			});
		}
	}

	let authMode: AuthMode;

	try {
		const { securityPreferences } = await storageService.getGlobalPreferences();
		authMode = securityPreferences.authentication.authMode;
	} catch (error) {
		logger.error('Error checking authentication preferences', error);
		return res.status(500).json({ message: 'Internal server error' });
	}

	const authValidators = [];

	if (authMode === AuthMode.NONE) {
		authValidators.push(allowAnonymous);
	} else {
		const isModeratorsOnlyMode = authMode === AuthMode.MODERATORS_ONLY && role === ParticipantRole.MODERATOR;
		const isAllUsersMode = authMode === AuthMode.ALL_USERS;

		if (isModeratorsOnlyMode || isAllUsersMode) {
			authValidators.push(tokenAndRoleValidator(UserRole.USER));
		} else {
			authValidators.push(allowAnonymous);
		}
	}

	return withAuth(...authValidators)(req, res, next);
};
