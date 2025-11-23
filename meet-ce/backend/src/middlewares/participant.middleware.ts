import { AuthMode, MeetRoomMemberRole, MeetRoomMemberTokenOptions, MeetUserRole } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { errorInsufficientPermissions, handleError, rejectRequestFromMeetError } from '../models/error.model.js';
import { GlobalConfigService } from '../services/global-config.service.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { RoomMemberService } from '../services/room-member.service.js';
import { allowAnonymous, tokenAndRoleValidator, withAuth } from './auth.middleware.js';

/**
 * Middleware to configure authentication for generating token to access room and its resources
 * based on room member role and authentication mode.
 *
 * - If the authentication mode is MODERATORS_ONLY and the room member role is MODERATOR, configure user authentication.
 * - If the authentication mode is ALL_USERS, configure user authentication.
 * - Otherwise, allow anonymous access.
 */
export const configureRoomMemberTokenAuth = async (req: Request, res: Response, next: NextFunction) => {
	const configService = container.get(GlobalConfigService);
	const roomMemberService = container.get(RoomMemberService);

	let role: MeetRoomMemberRole;

	try {
		const { roomId } = req.params;
		const { secret } = req.body as MeetRoomMemberTokenOptions;
		role = await roomMemberService.getRoomMemberRoleBySecret(roomId, secret);
	} catch (error) {
		return handleError(res, error, 'getting room member role by secret');
	}

	let authModeToAccessRoom: AuthMode;

	try {
		const securityConfig = await configService.getSecurityConfig();
		authModeToAccessRoom = securityConfig.authentication.authModeToAccessRoom;
	} catch (error) {
		return handleError(res, error, 'checking authentication config');
	}

	const authValidators = [];

	if (authModeToAccessRoom === AuthMode.NONE) {
		authValidators.push(allowAnonymous);
	} else {
		const isModeratorsOnlyMode =
			authModeToAccessRoom === AuthMode.MODERATORS_ONLY && role === MeetRoomMemberRole.MODERATOR;
		const isAllUsersMode = authModeToAccessRoom === AuthMode.ALL_USERS;

		if (isModeratorsOnlyMode || isAllUsersMode) {
			authValidators.push(tokenAndRoleValidator(MeetUserRole.USER));
		} else {
			authValidators.push(allowAnonymous);
		}
	}

	return withAuth(...authValidators)(req, res, next);
};

export const withModeratorPermissions = async (req: Request, res: Response, next: NextFunction) => {
	const { roomId } = req.params;

	const requestSessionService = container.get(RequestSessionService);
	const tokenRoomId = requestSessionService.getRoomIdFromToken();
	const role = requestSessionService.getRoomMemberRole();

	if (!tokenRoomId || !role) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	if (tokenRoomId !== roomId || role !== MeetRoomMemberRole.MODERATOR) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	return next();
};
