import { MeetRoomMemberPermissions, MeetRoomMemberTokenOptions, MeetUserRole } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { errorInsufficientPermissions, rejectRequestFromMeetError } from '../models/error.model.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { RoomService } from '../services/room.service.js';
import { allowAnonymous, AuthValidator, tokenAndRoleValidator, withAuth } from './auth.middleware.js';

/**
 * Middleware to configure authentication for generating room member tokens.
 *
 * - If a secret is provided in the request body, anonymous access is allowed.
 * - If no secret is provided, the user must be authenticated as ADMIN, USER, or ROOM_MEMBER.
 */
export const setupRoomMemberTokenAuthentication = async (req: Request, res: Response, next: NextFunction) => {
	const { secret } = req.body as MeetRoomMemberTokenOptions;
	const authValidators: AuthValidator[] = [];

	if (secret) {
		authValidators.push(allowAnonymous);
	} else {
		authValidators.push(tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER));
	}

	return withAuth(...authValidators)(req, res, next);
};

/**
 * Middleware to authorize the generation of a room member token.
 *
 * - If a secret is provided, it checks if it matches a valid room secret (anonymous access) or if it corresponds to a room member.
 * - If no secret is provided, it checks if the authenticated user has permissions to access the room (Admin, Owner, or Member).
 */
export const authorizeRoomMemberTokenGeneration = async (req: Request, res: Response, next: NextFunction) => {
	const { roomId } = req.params;
	const { secret } = req.body as MeetRoomMemberTokenOptions;

	const requestSessionService = container.get(RequestSessionService);
	const roomService = container.get(RoomService);
	const user = requestSessionService.getAuthenticatedUser();

	const forbiddenError = errorInsufficientPermissions();

	// Scenario 1: Secret provided (Anonymous access or Member ID)
	if (secret) {
		// Check if secret matches any room access URL secret
		const isValidSecret = await roomService.isValidRoomSecret(roomId, secret);

		if (isValidSecret) {
			return next();
		}

		// Check if secret is a memberId
		const isMember = await roomService.isRoomMember(roomId, secret);

		if (isMember) {
			return next();
		}

		return rejectRequestFromMeetError(res, forbiddenError);
	}

	// Scenario 2: No secret provided (Authenticated User)
	if (user) {
		const canAccess = await roomService.canUserAccessRoom(roomId, user);

		if (!canAccess) {
			return rejectRequestFromMeetError(res, forbiddenError);
		}

		return next();
	}

	return rejectRequestFromMeetError(res, forbiddenError);
};

/**
 * Middleware to check if the room member has a specific permission.
 *
 * @param permission The permission to check (key of MeetRoomMemberPermissions).
 */
export const withRoomMemberPermission = (permission: keyof MeetRoomMemberPermissions) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const roomId = MeetRoomHelper.getRoomIdFromRequest(req);

		const requestSessionService = container.get(RequestSessionService);
		const memberRoomId = requestSessionService.getRoomIdFromMember();
		const permissions = requestSessionService.getRoomMemberPermissions();

		if (!memberRoomId || !permissions) {
			const error = errorInsufficientPermissions();
			return rejectRequestFromMeetError(res, error);
		}

		if (memberRoomId !== roomId || !permissions[permission]) {
			const error = errorInsufficientPermissions();
			return rejectRequestFromMeetError(res, error);
		}

		return next();
	};
};
