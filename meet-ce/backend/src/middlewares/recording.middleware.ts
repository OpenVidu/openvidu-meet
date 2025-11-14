import { MeetRoom, MeetUserRole } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/index.js';
import { RecordingHelper } from '../helpers/index.js';
import {
	errorInsufficientPermissions,
	errorInvalidRecordingSecret,
	errorRecordingDisabled,
	errorRecordingNotFound,
	handleError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { RecordingRepository } from '../repositories/index.js';
import { LoggerService, RequestSessionService, RoomService } from '../services/index.js';
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
		const roomId = extractRoomIdFromRequest(req);
		const room: MeetRoom = await roomService.getMeetRoom(roomId!);

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

export const withCanRecordPermission = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = extractRoomIdFromRequest(req);

	const requestSessionService = container.get(RequestSessionService);
	const tokenRoomId = requestSessionService.getRoomIdFromToken();
	const permissions = requestSessionService.getRoomMemberMeetPermissions();

	if (!tokenRoomId || !permissions) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	if (tokenRoomId !== roomId || !permissions.canRecord) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	return next();
};

export const withCanRetrieveRecordingsPermission = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = extractRoomIdFromRequest(req);

	const requestSessionService = container.get(RequestSessionService);
	const tokenRoomId = requestSessionService.getRoomIdFromToken();

	/**
	 * If there is no token, the user is allowed to access the resource because one of the following reasons:
	 *
	 * - The request is invoked using the API key.
	 * - The user is admin.
	 * - The user is anonymous and is using the public access secret.
	 * - The user is using the private access secret and is authenticated.
	 */
	if (!tokenRoomId) {
		return next();
	}

	const permissions = requestSessionService.getRoomMemberMeetPermissions();

	if (!permissions) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	const sameRoom = roomId ? tokenRoomId === roomId : true;

	if (!sameRoom || !permissions.canRetrieveRecordings) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	return next();
};

export const withCanDeleteRecordingsPermission = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = extractRoomIdFromRequest(req);

	const requestSessionService = container.get(RequestSessionService);
	const tokenRoomId = requestSessionService.getRoomIdFromToken();

	// If there is no token, the user is admin or it is invoked using the API key
	// In this case, the user is allowed to access the resource
	if (!tokenRoomId) {
		return next();
	}

	const permissions = requestSessionService.getRoomMemberMeetPermissions();

	if (!permissions) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	const sameRoom = roomId ? tokenRoomId === roomId : true;

	if (!sameRoom || !permissions.canDeleteRecordings) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	return next();
};

/**
 * Middleware to configure authentication for retrieving recording based on the provided secret.
 *
 * - If a valid secret is provided in the query, access is granted according to the secret type.
 * - If no secret is provided, the default authentication logic is applied, i.e., API key, admin and room member token access.
 */
export const configureRecordingAuth = async (req: Request, res: Response, next: NextFunction) => {
	const secret = req.query.secret as string;

	// If a secret is provided, validate it against the stored secrets
	// and apply the appropriate authentication logic.
	if (secret) {
		try {
			const recordingId = req.params.recordingId as string;

			const recordingRepository = container.get(RecordingRepository);
			const recordingSecrets = await recordingRepository.findAccessSecretsByRecordingId(recordingId);

			if (!recordingSecrets) {
				const error = errorRecordingNotFound(recordingId);
				return rejectRequestFromMeetError(res, error);
			}

			const authValidators = [];

			switch (secret) {
				case recordingSecrets.publicAccessSecret:
					// Public access secret allows anonymous access
					authValidators.push(allowAnonymous);
					break;
				case recordingSecrets.privateAccessSecret:
					// Private access secret requires authentication with user role
					authValidators.push(tokenAndRoleValidator(MeetUserRole.USER));
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
	// This will allow API key, admin and room member token access.
	const authValidators = [apiKeyValidator, tokenAndRoleValidator(MeetUserRole.ADMIN), roomMemberTokenValidator];
	return withAuth(...authValidators)(req, res, next);
};

const extractRoomIdFromRequest = (req: Request): string | undefined => {
	if (req.body.roomId) {
		return req.body.roomId as string;
	}

	// If roomId is not in the body, check if it's in the params
	const recordingId = req.params.recordingId as string;

	if (!recordingId) {
		return undefined;
	}

	const { roomId } = RecordingHelper.extractInfoFromRecordingId(recordingId);
	return roomId;
};
