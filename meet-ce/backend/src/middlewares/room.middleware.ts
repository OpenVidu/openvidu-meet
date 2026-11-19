import type { MeetParticipantHandOptions, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MeetUserRole } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import type { OpenViduMeetError } from '../models/error.model.js';
import { errorInsufficientPermissions, errorRoomNotFound } from '../models/error.model.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { RoomAccessService } from '../services/room-access.service.js';
import { RoomService } from '../services/room.service.js';
import { RoomQueryWithFields } from '../types/room-projection.types.js';
import { handleError, rejectRequestFromMeetError } from './error-handler.middleware.js';

/**
 * Middleware to apply room list access filters to validated query options.
 *
 * - ADMIN: can list all rooms (no extra filters)
 * - ROOM_MANAGER: can list rooms they own or where they are members (and rooms with user access enabled)
 * - ROOM_MEMBER: can list only rooms where they are members (and rooms with user access enabled)
 */
export const applyRoomListAccessFilters = (_req: Request, res: Response, next: NextFunction) => {
	const requestSessionService = container.get(RequestSessionService);
	const user = requestSessionService.getAuthenticatedUser();

	// If there is no authenticated user, reject the request
	if (!user) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	// ADMIN users can list all rooms.
	if (user.role === MeetUserRole.ADMIN) {
		return next();
	}

	const queryOptions = (res.locals.validatedQuery ??= {}) as RoomQueryWithFields;
	const hasScopeFilters = !!queryOptions.owner || !!queryOptions.member || queryOptions.userAccess;

	// Non-admin users can only scope owner/member filters to their own userId.
	if (queryOptions.owner && queryOptions.owner !== user.userId) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	if (queryOptions.member && queryOptions.member !== user.userId) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	// Default behavior when client does not provide explicit scope filters:
	// ROOM_MANAGER => owned OR member OR user access
	// ROOM_MEMBER => member OR user access
	if (!hasScopeFilters) {
		if (user.role === MeetUserRole.ROOM_MANAGER) {
			queryOptions.owner = user.userId;
		}

		queryOptions.member = user.userId;
		queryOptions.userAccess = true;
	}

	res.locals.validatedQuery = queryOptions;
	return next();
};

/**
 * Whether the request carries a room member token of a room other than `roomId`. Such a token is
 * refused before the room is looked up, so it cannot tell which rooms exist.
 */
export const isTokenOfAnotherRoom = (roomId: string): boolean => {
	const memberRoomId = container.get(RequestSessionService).getRoomIdFromMember();
	return memberRoomId !== undefined && memberRoomId !== roomId;
};

/**
 * Middleware to authorize access to a room.
 *
 * - If a Room Member Token is used, it checks that the token's roomId matches the requested roomId.
 * - If a user is authenticated, it checks their role and whether they are the owner or a member of the room.
 * - If neither a valid token nor an authenticated user is present, it rejects the request.
 */
export const authorizeRoomAccess = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = req.params.roomId as string;
	const forbiddenError = errorInsufficientPermissions();

	if (isTokenOfAnotherRoom(roomId)) {
		return rejectRequestFromMeetError(res, forbiddenError);
	}

	const requestSessionService = container.get(RequestSessionService);

	// The room member token validator already proved that its room exists
	if (requestSessionService.getRoomIdFromMember()) {
		return next();
	}

	const user = requestSessionService.getAuthenticatedUser();

	if (user) {
		try {
			const canAccess = await container.get(RoomAccessService).canUserAccessRoom(roomId, user);

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
 * Middleware to check if the authenticated principal has a specific permission in the room.
 *
 * @param permission The permission to check (key of MeetRoomMemberPermissions).
 * @param roomIdOf Where the request names the room, its `roomId` path parameter unless said otherwise.
 */
export const withRoomPermission = (
	permission: keyof MeetRoomMemberPermissions,
	roomIdOf: (req: Request, res: Response) => string = (req) => req.params.roomId as string
) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const roomId = roomIdOf(req, res);

		if (isTokenOfAnotherRoom(roomId)) {
			return rejectRequestFromMeetError(res, errorInsufficientPermissions());
		}

		const roomService = container.get(RoomService);
		const tokenValidatedAgainstRoom = !!container.get(RequestSessionService).getRoom(roomId);

		try {
			const roomExists = tokenValidatedAgainstRoom || (await roomService.meetRoomExists(roomId));

			if (!roomExists) {
				const error = errorRoomNotFound(roomId);
				return rejectRequestFromMeetError(res, error);
			}

			const permissions = await container.get(RoomAccessService).getAuthenticatedRoomMemberPermissions(roomId);

			if (!permissions[permission]) {
				const error = errorInsufficientPermissions();
				return rejectRequestFromMeetError(res, error);
			}

			return next();
		} catch (error) {
			return handleError(res, error, `checking '${permission}' permission in room '${roomId}'`);
		}
	};
};

const checkHandLowerPermission = withRoomPermission('participantLowerHand');

/**
 * Authorizes a change to a participant's hand. A participant raises and lowers their own hand
 * without any permission, and lowering another participant's hand needs `participantLowerHand`.
 * Raising it is never allowed, whatever the caller holds, which the meeting service answers once
 * it knows the room has a meeting.
 */
export const withHandUpdatePermission = (req: Request, res: Response, next: NextFunction) => {
	const callerIdentity = container.get(RequestSessionService).getParticipantIdentity();

	if (callerIdentity && callerIdentity === req.params.participantIdentity) {
		return next();
	}

	if (!(req.body as MeetParticipantHandOptions).handRaised) {
		return checkHandLowerPermission(req, res, next);
	}

	if (isTokenOfAnotherRoom(req.params.roomId as string)) {
		return rejectRequestFromMeetError(res, errorInsufficientPermissions());
	}

	return next();
};

/**
 * Middleware to authorize management of a room.
 *
 * - Checks if the authenticated user is an admin or the owner of the room.
 */
export const authorizeRoomManagement = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = req.params.roomId as string;

	try {
		const { owner } = await container.get(RoomService).getMeetRoom(roomId, ['owner']);
		const user = container.get(RequestSessionService).getAuthenticatedUser();

		if (!user || (user.role !== MeetUserRole.ADMIN && owner !== user.userId)) {
			return rejectRequestFromMeetError(res, errorInsufficientPermissions());
		}

		return next();
	} catch (error) {
		return handleError(res, error, 'checking room ownership');
	}
};

/**
 * Middleware to partition roomIds for bulk delete into processable and failed entries.
 *
 * Failed entries include:
 * - Rooms that do not exist.
 * - Rooms the authenticated non-admin user cannot manage.
 */
export const validateBulkDeleteRoomManagement = async (_req: Request, res: Response, next: NextFunction) => {
	const user = container.get(RequestSessionService).getAuthenticatedUser();
	const { roomIds } = res.locals.validatedQuery as { roomIds: string[] };

	const owners =
		user && user.role !== MeetUserRole.ADMIN ? await container.get(RoomService).getRoomOwners(roomIds) : undefined;

	const findManagementError = (roomId: string): OpenViduMeetError | undefined => {
		if (!owners) {
			return undefined;
		}

		if (!owners.has(roomId)) {
			return errorRoomNotFound(roomId);
		}

		return owners.get(roomId) === user?.userId ? undefined : errorInsufficientPermissions();
	};

	const processableIds: string[] = [];
	const failed: { roomId: string; error: string; message: string }[] = [];

	roomIds.forEach((roomId) => {
		const error = findManagementError(roomId);

		if (error) {
			failed.push({ roomId, error: error.name, message: error.message });
		} else {
			processableIds.push(roomId);
		}
	});

	res.locals.bulkValidation = {
		processableIds,
		failed
	};
	return next();
};
