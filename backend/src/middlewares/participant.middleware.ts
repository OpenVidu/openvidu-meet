import { Request, Response, NextFunction } from 'express';
import { AuthMode, ParticipantRole, UserRole, TokenOptions } from '@typings-ce';
import { container } from '../config/dependency-injector.config.js';
import { GlobalPreferencesService, LoggerService, RoomService } from '../services/index.js';
import { allowAnonymous, tokenAndRoleValidator, withAuth } from './auth.middleware.js';

export const configureTokenAuth = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);
	const globalPrefService = container.get(GlobalPreferencesService);
	const roomService = container.get(RoomService);

	let role: ParticipantRole;

	try {
		const { roomName, secret } = req.body as TokenOptions;
		role = await roomService.getRoomSecretRole(roomName, secret);
	} catch (error) {
		logger.error('Error getting room secret role', error);
		return res.status(500).json({ message: 'Internal server error' });
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
	const roomName = req.query.roomName as string;
	const payload = req.session?.tokenClaims;

	if (!payload) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	const sameRoom = payload.video?.room === roomName;
	const metadata = JSON.parse(payload.metadata || '{}');
	const role = metadata.role as ParticipantRole;

	if (!sameRoom || role !== ParticipantRole.MODERATOR) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	return next();
};
