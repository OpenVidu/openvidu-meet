import type { MeetRoomMemberTokenOptions } from '@openvidu-meet/typings';
import { MeetUserRole } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import {
	errorInsufficientPermissions,
	errorInvalidRoomSecret,
	errorRoomMemberNotFound,
	errorRoomNotFound,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { RoomMemberService } from '../services/room-member.service.js';
import { RoomService } from '../services/room.service.js';
import type { AuthValidator } from './auth.middleware.js';
import { accessTokenValidator, allowAnonymous, withAuth } from './auth.middleware.js';

/**
 * Middleware to authorize access to specific room member information.
 *
 * - If the user is authenticated via room member token, checks if they are accessing their own info.
 * - If authenticated as a user (Meet account holder), checks if they have management permissions (admin or owner),
 *  or if they are accessing their own member info.
 *
 * The caller is authorized before the member is looked up, so a caller without access cannot tell which
 * members exist. A room that does not exist answers 404 first, as every room-scoped operation does.
 */
export const authorizeRoomMemberAccess = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = req.params.roomId as string;
	const memberId = req.params.memberId as string;

	try {
		const { owner } = await container.get(RoomService).getMeetRoom(roomId, ['owner']);

		if (!canReadRoomMember(roomId, memberId, owner)) {
			return rejectRequestFromMeetError(res, errorInsufficientPermissions());
		}

		const isMember = await container.get(RoomMemberService).isRoomMember(roomId, memberId);

		if (!isMember) {
			return rejectRequestFromMeetError(res, errorRoomMemberNotFound(roomId, memberId));
		}

		return next();
	} catch (error) {
		return handleError(res, error, 'authorizing access to a room member');
	}
};

const canReadRoomMember = (roomId: string, memberId: string, owner: string): boolean => {
	const requestSessionService = container.get(RequestSessionService);
	const memberRoomId = requestSessionService.getRoomIdFromMember();

	if (memberRoomId) {
		return memberRoomId === roomId && requestSessionService.getRoomMemberId() === memberId;
	}

	const user = requestSessionService.getAuthenticatedUser();

	if (!user) {
		return false;
	}

	return user.role === MeetUserRole.ADMIN || user.userId === owner || user.userId === memberId;
};

/**
 * Middleware to configure authentication for generating room member tokens.
 *
 * - If a secret is provided in the request body, anonymous access is allowed.
 * - If no secret is provided, the user must be authenticated as ADMIN, ROOM_MANAGER, or ROOM_MEMBER.
 */
export const setupRoomMemberTokenAuthentication = (req: Request, res: Response, next: NextFunction) => {
	const { secret } = req.body as MeetRoomMemberTokenOptions;
	const authValidators: AuthValidator[] = [];

	if (secret) {
		authValidators.push(allowAnonymous);
	} else {
		authValidators.push(accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.ROOM_MANAGER, MeetUserRole.ROOM_MEMBER));
	}

	return withAuth(...authValidators)(req, res, next);
};

/**
 * Middleware to authorize the generation of a room member token.
 *
 * - If a secret is provided, it checks if it matches a valid room secret (anonymous access) or if it corresponds to a room member.
 * - If no secret is provided, it checks if the authenticated user has permissions to access the room (admin, owner, or member).
 */
export const authorizeRoomMemberTokenGeneration = async (req: Request, res: Response, next: NextFunction) => {
	const { roomId } = req.params as Record<string, string>;
	const { secret } = req.body as MeetRoomMemberTokenOptions;

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

	// Scenario 1: Secret provided (Anonymous access or Member ID)
	if (secret) {
		try {
			const isIdentifiedGuestMemberId = secret.startsWith('guest-');

			if (isIdentifiedGuestMemberId) {
				// Check if secret is a memberId
				const roomMemberService = container.get(RoomMemberService);
				const isMember = await roomMemberService.isRoomMember(roomId, secret);

				if (!isMember) {
					const error = errorRoomMemberNotFound(roomId, secret);
					return rejectRequestFromMeetError(res, error);
				}

				return next();
			}

			// Check if secret matches any room access URL secret
			const isValidSecret = await roomService.isValidRoomSecret(roomId, secret);

			if (!isValidSecret) {
				const error = errorInvalidRoomSecret(roomId);
				return rejectRequestFromMeetError(res, error);
			}

			return next();
		} catch (error) {
			return handleError(res, error, 'checking room secret');
		}
	}

	// Scenario 2: No secret provided (Authenticated User)
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

	return rejectRequestFromMeetError(res, forbiddenError);
};
