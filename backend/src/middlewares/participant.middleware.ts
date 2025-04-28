import { AuthMode, ParticipantOptions, ParticipantRole, UserRole } from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/index.js';
import { OpenViduMeetError } from '../models/error.model.js';
import { LoggerService, MeetStorageService, RoomService } from '../services/index.js';
import { allowAnonymous, tokenAndRoleValidator, withAuth } from './auth.middleware.js';

/**
 * Middleware to configure authentication based on participant role and authentication mode for entering a room.
 *
 * - If the authentication mode is MODERATORS_ONLY and the participant role is MODERATOR, configure user authentication.
 * - If the authentication mode is ALL_USERS, configure user authentication.
 * - Otherwise, allow anonymous access.
 */
export const configureParticipantTokenAuth = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);
	const globalPrefService = container.get(MeetStorageService);
	const roomService = container.get(RoomService);

	let role: ParticipantRole;

	try {
		const { roomId, secret } = req.body as ParticipantOptions;
		role = await roomService.getRoomRoleBySecret(roomId, secret);
	} catch (error) {
		logger.error('Error getting room role by secret', error);

		if (error instanceof OpenViduMeetError) {
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		} else {
			return res.status(500).json({
				name: 'Participant Error',
				message: 'Internal server error. Participant operation failed'
			});
		}
	}

	let authMode: AuthMode;

	try {
		const { securityPreferences } = await globalPrefService.getGlobalPreferences();
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

export const withModeratorPermissions = async (req: Request, res: Response, next: NextFunction) => {
	const { roomId } = req.params;
	const payload = req.session?.tokenClaims;

	if (!payload) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	const sameRoom = payload.video?.room === roomId;
	const metadata = JSON.parse(payload.metadata || '{}');
	const role = metadata.role as ParticipantRole;

	if (!sameRoom || role !== ParticipantRole.MODERATOR) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	return next();
};
