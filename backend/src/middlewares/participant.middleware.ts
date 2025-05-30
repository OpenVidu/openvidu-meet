import { AuthMode, ParticipantOptions, ParticipantRole, UserRole } from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/index.js';
import { errorInsufficientPermissions, handleError, rejectRequestFromMeetError } from '../models/error.model.js';
import { MeetStorageService, RoomService } from '../services/index.js';
import { allowAnonymous, tokenAndRoleValidator, withAuth } from './auth.middleware.js';

/**
 * Middleware to configure authentication based on participant role and authentication mode for entering a room.
 *
 * - If the authentication mode is MODERATORS_ONLY and the participant role is MODERATOR, configure user authentication.
 * - If the authentication mode is ALL_USERS, configure user authentication.
 * - Otherwise, allow anonymous access.
 */
export const configureParticipantTokenAuth = async (req: Request, res: Response, next: NextFunction) => {
	const globalPrefService = container.get(MeetStorageService);
	const roomService = container.get(RoomService);

	let role: ParticipantRole;

	try {
		const { roomId, secret } = req.body as ParticipantOptions;
		role = await roomService.getRoomRoleBySecret(roomId, secret);
	} catch (error) {
		return handleError(res, error, 'getting room role by secret');
	}

	let authModeToAccessRoom: AuthMode;

	try {
		const { securityPreferences } = await globalPrefService.getGlobalPreferences();
		authModeToAccessRoom = securityPreferences.authentication.authModeToAccessRoom;
	} catch (error) {
		return handleError(res, error, 'checking authentication preferences');
	}

	const authValidators = [];

	if (authModeToAccessRoom === AuthMode.NONE) {
		authValidators.push(allowAnonymous);
	} else {
		const isModeratorsOnlyMode = authModeToAccessRoom === AuthMode.MODERATORS_ONLY && role === ParticipantRole.MODERATOR;
		const isAllUsersMode = authModeToAccessRoom === AuthMode.ALL_USERS;

		if (isModeratorsOnlyMode || isAllUsersMode) {
			authValidators.push(tokenAndRoleValidator(UserRole.USER));
		} else {
			authValidators.push(allowAnonymous);
		}
	}

	return withAuth(...authValidators)(req, res, next);
};

export const withModeratorPermissions = async (req: Request, res: Response, next: NextFunction) => {
	const { roomId } = req.params;
	const payload = req.session?.tokenClaims;

	if (!payload) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	const sameRoom = payload.video?.room === roomId;
	const metadata = JSON.parse(payload.metadata || '{}');
	const role = metadata.role as ParticipantRole;

	if (!sameRoom || role !== ParticipantRole.MODERATOR) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	return next();
};
