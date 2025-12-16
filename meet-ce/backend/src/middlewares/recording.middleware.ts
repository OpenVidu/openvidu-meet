import { MeetRoomMemberPermissions, MeetUserRole } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import {
	errorInsufficientPermissions,
	errorInvalidRecordingSecret,
	errorRecordingDisabled,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';
import { RecordingService } from '../services/recording.service.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { RoomMemberService } from '../services/room-member.service.js';
import { RoomService } from '../services/room.service.js';
import {
	allowAnonymous,
	apiKeyValidator,
	roomMemberTokenValidator,
	tokenAndRoleValidator,
	withAuth
} from './auth.middleware.js';

export const withRecordingEnabled = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);

	try {
		const roomId = MeetRoomHelper.getRoomIdFromRequest(req);
		const room = await roomService.getMeetRoom(roomId!);

		if (!room.config.recording.enabled) {
			logger.debug(`Recording is disabled for room '${roomId}'`);
			const error = errorRecordingDisabled(roomId!);
			return rejectRequestFromMeetError(res, error);
		}

		return next();
	} catch (error) {
		handleError(res, error, 'checking recording config');
	}
};

/**
 * Middleware to configure authentication for retrieving recording based on the provided secret.
 *
 * - If a valid secret is provided in the query, access is granted according to the secret type.
 * - If no secret is provided, the default authentication logic is applied, i.e., API key, admin and room member token access.
 */
export const setupRecordingAuthentication = async (req: Request, res: Response, next: NextFunction) => {
	const secret = req.query.secret as string;

	// If a secret is provided, validate it against the stored secrets
	// and apply the appropriate authentication logic.
	if (secret) {
		try {
			const recordingId = req.params.recordingId as string;

			const recordingService = container.get(RecordingService);
			const recordingSecrets = await recordingService.getRecordingAccessSecrets(recordingId);

			const authValidators = [];

			switch (secret) {
				case recordingSecrets.publicAccessSecret:
					// Public access secret allows anonymous access
					authValidators.push(allowAnonymous);
					break;
				case recordingSecrets.privateAccessSecret:
					// Private access secret requires authentication
					authValidators.push(
						tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
					);
					break;
				default:
					// Invalid secret provided
					return rejectRequestFromMeetError(res, errorInvalidRecordingSecret(recordingId, secret));
			}

			return withAuth(...authValidators)(req, res, next);
		} catch (error) {
			return handleError(res, error, 'retrieving recording secrets');
		}
	}

	// If no secret is provided, we proceed with the default authentication logic.
	// This will allow API key, registered user and room member token access.
	const authValidators = [
		apiKeyValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER),
		roomMemberTokenValidator
	];
	return withAuth(...authValidators)(req, res, next);
};

/**
 * Middleware to authorize recording access (retrieval or deletion).
 *
 * - If a secret is provided in the request query, and allowSecretAccess is true,
 *   it assumes the secret has been validated and grants access.
 * - If a Room Member Token is used, it checks that the token's roomId matches the requested roomId
 *   and that the member has the required permission.
 * - If a registered user is authenticated, it checks their role and whether they are the owner or a member of the room
 *   with the required permission.
 * - If neither a valid token nor an authenticated user is present, it rejects the request.
 *
 * @param permission - The permission to check (canRetrieveRecordings or canDeleteRecordings).
 * @param allowSecretAccess - Whether to allow access based on a valid secret in the query.
 */
export const authorizeRecordingAccess = (permission: keyof MeetRoomMemberPermissions, allowSecretAccess = false) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const roomId = MeetRoomHelper.getRoomIdFromRequest(req);
		const secret = req.query.secret as string;

		// If allowSecretAccess is true and a secret is provided,
		// we assume it has been validated by setupRecordingAuthentication.
		if (allowSecretAccess && secret) {
			return next();
		}

		const requestSessionService = container.get(RequestSessionService);
		const roomService = container.get(RoomService);
		const roomMemberService = container.get(RoomMemberService);

		const memberRoomId = requestSessionService.getRoomIdFromMember();
		const user = requestSessionService.getAuthenticatedUser();

		const forbiddenError = errorInsufficientPermissions();

		// Case 1: Room Member Token
		if (memberRoomId) {
			const permissions = requestSessionService.getRoomMemberPermissions();

			if (!permissions) {
				return rejectRequestFromMeetError(res, forbiddenError);
			}

			const sameRoom = roomId ? memberRoomId === roomId : true;

			if (!sameRoom || !permissions[permission]) {
				return rejectRequestFromMeetError(res, forbiddenError);
			}

			return next();
		}

		// Case 2: Authenticated User
		if (user) {
			// If no roomId is specified, we are in a listing/bulk request
			// Each recording's room ownership and permissions will be checked individually
			if (!roomId) {
				return next();
			}

			// Admins can always access
			if (user.role === MeetUserRole.ADMIN) {
				return next();
			}

			// Check if owner
			const isOwner = await roomService.isRoomOwner(roomId, user.userId);

			if (isOwner) {
				return next();
			}

			// Check if member with permissions
			const member = await roomMemberService.getRoomMember(roomId, user.userId);

			if (member && member.effectivePermissions[permission]) {
				return next();
			}

			return rejectRequestFromMeetError(res, forbiddenError);
		}

		// Otherwise, reject the request
		return rejectRequestFromMeetError(res, forbiddenError);
	};
};
