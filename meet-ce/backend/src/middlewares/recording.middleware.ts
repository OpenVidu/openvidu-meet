import { MeetRoomMemberPermissions, MeetUserRole } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
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
import { RoomService } from '../services/room.service.js';
import {
	allowAnonymous,
	apiKeyValidator,
	roomMemberTokenValidator,
	tokenAndRoleValidator,
	withAuth
} from './auth.middleware.js';

/**
 * Middleware to ensure that recording is enabled for the specified room.
 */
export const withRecordingEnabled = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);

	try {
		const { roomId } = req.body as { roomId: string };
		const room = await roomService.getMeetRoom(roomId!);

		if (!room.config.recording.enabled) {
			logger.debug(`Recording is disabled for room '${roomId}'`);
			const error = errorRecordingDisabled(roomId!);
			return rejectRequestFromMeetError(res, error);
		}

		return next();
	} catch (error) {
		handleError(res, error, 'checking room recording config');
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
		roomMemberTokenValidator,
		tokenAndRoleValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	];
	return withAuth(...authValidators)(req, res, next);
};

/**
 * Middleware to authorize access (retrieval or deletion) for a single recording.
 *
 * - If a secret is provided in the request query, it is assumed to have been validated already.
 *   In that case, access is granted directly for retrieval requests.
 * - If no secret is provided, the recording's existence and permissions are checked
 *   based on the authenticated context (room member token or registered user).
 *
 * @param permission - The permission to check (canRetrieveRecordings or canDeleteRecordings).
 */
export const authorizeRecordingAccess = (permission: keyof MeetRoomMemberPermissions) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const recordingId = req.params.recordingId as string;
		const secret = req.query.secret as string | undefined;

		// If a secret is provided, we assume it has been validated by setupRecordingAuthentication.
		// In that case, grant access directly for retrieval requests.
		if (secret && permission === 'canRetrieveRecordings') {
			return next();
		}

		try {
			// Check recording existence and permissions based on the authenticated context
			const recordingService = container.get(RecordingService);
			await recordingService.validateRecordingAccess(recordingId, permission);
			return next();
		} catch (error) {
			return handleError(res, error, 'checking recording permissions');
		}
	};
};

/**
 * Middleware to authorize access (retrieval or deletion) for multiple recordings.
 *
 * - If a room member token is present, checks if the member has the specified permission.
 * - If no room member token is present, each recording's permissions will be checked individually later.
 *
 * @param permission - The permission to check (canRetrieveRecordings or canDeleteRecordings).
 */
export const authorizeBulkRecordingAccess = (permission: keyof MeetRoomMemberPermissions) => {
	return async (_req: Request, res: Response, next: NextFunction) => {
		const requestSessionService = container.get(RequestSessionService);
		const memberRoomId = requestSessionService.getRoomIdFromMember();

		// If there is no room member token,
		// each recording's permissions will be checked individually later
		if (!memberRoomId) {
			return next();
		}

		// If there is a room member token, check permissions now
		// because they have the same permissions for all recordings in the room associated with the token
		const permissions = requestSessionService.getRoomMemberPermissions();

		if (!permissions || !permissions[permission]) {
			const forbiddenError = errorInsufficientPermissions();
			return rejectRequestFromMeetError(res, forbiddenError);
		}

		return next();
	};
};

/**
 * Middleware to authorize control actions (start/stop) for recordings.
 *
 * - For starting a recording, checks if the authenticated user has 'canRecord' permission in the target room.
 * - For stopping a recording, checks if the recording exists and if the authenticated user has 'canRecord' permission.
 */
export const authorizeRecordingControl = async (req: Request, res: Response, next: NextFunction) => {
	const recordingId = req.params.recordingId as string | undefined;

	if (!recordingId) {
		// Start recording
		const { roomId } = req.body as { roomId: string };

		try {
			// Check that the authenticated user has 'canRecord' permission in the target room
			const roomService = container.get(RoomService);
			const permissions = await roomService.getAuthenticatedRoomMemberPermissions(roomId);

			if (!permissions['canRecord']) {
				throw errorInsufficientPermissions();
			}

			return next();
		} catch (error) {
			return handleError(res, error, 'checking recording permissions');
		}
	} else {
		// Stop recording
		try {
			// Check that the recording exists and the authenticated user has 'canRecord' permission
			const recordingService = container.get(RecordingService);
			await recordingService.validateRecordingAccess(recordingId, 'canRecord');
			return next();
		} catch (error) {
			return handleError(res, error, 'checking recording permissions');
		}
	}
};
