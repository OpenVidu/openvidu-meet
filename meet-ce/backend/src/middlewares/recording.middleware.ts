import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MeetUserRole } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { RecordingHelper } from '../helpers/recording.helper.js';
import {
	errorAnonymousAccessDisabled,
	errorInsufficientPermissions,
	errorInvalidRecordingSecret,
	errorRecordingDisabled,
	handleError,
	OpenViduMeetError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';
import { RecordingService } from '../services/recording.service.js';
import { RequestSessionService } from '../services/request-session.service.js';
import { RoomService } from '../services/room.service.js';
import { RecordingQueryWithFields } from '../types/recording-projection.types.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import {
	accessTokenValidator,
	allowAnonymous,
	apiKeyValidator,
	roomMemberTokenValidator,
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
		const { config } = await roomService.getMeetRoom(roomId!, ['config']);

		if (!config.recording.enabled) {
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
 * Middleware to configure authentication for retrieving recording based on the provided recording secret.
 *
 * - If a valid recordingSecret is provided in the query, access is granted according to the secret type.
 * - If no recordingSecret is provided, the default authentication logic is applied, i.e., API key, user and room member token access.
 */
export const setupRecordingAuthentication = async (req: Request, res: Response, next: NextFunction) => {
	const recordingSecret = req.query.recordingSecret as string;

	// If a recording secret is provided, validate it against the stored secrets
	// and apply the appropriate authentication logic.
	if (recordingSecret) {
		try {
			const recordingId = req.params.recordingId as string;

			const recordingService = container.get(RecordingService);
			const recordingSecrets = await recordingService.getRecordingAccessSecrets(recordingId);

			const authValidators = [];

			switch (recordingSecret) {
				case recordingSecrets.publicAccessSecret: {
					// Public recording secret is only valid if anonymous recording access is enabled in the room
					const { roomId } = RecordingHelper.extractInfoFromRecordingId(recordingId);
					const roomService = container.get(RoomService);
					const { access } = await roomService.getMeetRoom(roomId, ['access']);

					if (!access.anonymous.recording.enabled) {
						return rejectRequestFromMeetError(
							res,
							errorAnonymousAccessDisabled(roomId, 'recording')
						);
					}

					// Public access secret allows anonymous access
					authValidators.push(allowAnonymous);
					break;
				}

				case recordingSecrets.privateAccessSecret:
					// Private access secret requires authentication
					authValidators.push(
						accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
					);
					break;
				default:
					// Invalid secret provided
					return rejectRequestFromMeetError(res, errorInvalidRecordingSecret(recordingId, recordingSecret));
			}

			return withAuth(...authValidators)(req, res, next);
		} catch (error) {
			return handleError(res, error, 'retrieving recording secrets');
		}
	}

	// If no recording secret is provided, we proceed with the default authentication logic.
	// This will allow API key, registered user and room member token access.
	const authValidators = [
		apiKeyValidator,
		roomMemberTokenValidator,
		accessTokenValidator(MeetUserRole.ADMIN, MeetUserRole.USER, MeetUserRole.ROOM_MEMBER)
	];
	return withAuth(...authValidators)(req, res, next);
};

/**
 * Middleware to apply recording list access filters to validated query options.
 *
 * - Room member token: can list recordings from the associated room when token has canRetrieveRecordings permission.
 * - ADMIN: can list all recordings.
 * - USER: defaults to owner OR member OR registered-access scopes.
 * - ROOM_MEMBER: defaults to member OR registered-access scopes.
 */
export const applyRecordingListAccessFilters = async (_req: Request, res: Response, next: NextFunction) => {
	const requestSessionService = container.get(RequestSessionService);
	const memberRoomId = requestSessionService.getRoomIdFromMember();

	const queryOptions = res.locals.validatedQuery as RecordingQueryWithFields;

	// If request is made with room member token,
	// scope recordings to the associated room and check canRetrieveRecordings permission.
	if (memberRoomId) {
		const permissions = requestSessionService.getRoomMemberPermissions();

		// If member token does not have canRetrieveRecordings permission, reject the request
		if (!permissions?.canRetrieveRecordings) {
			const error = errorInsufficientPermissions();
			return rejectRequestFromMeetError(res, error);
		}

		queryOptions.roomId = memberRoomId;
		queryOptions.roomOwner = undefined;
		queryOptions.roomRegisteredAccess = undefined;
		res.locals.validatedQuery = queryOptions;
		return next();
	}

	const user = requestSessionService.getAuthenticatedUser();

	// If there is no authenticated user, reject the request
	if (!user) {
		const error = errorInsufficientPermissions();
		return rejectRequestFromMeetError(res, error);
	}

	// ADMIN can list all recordings.
	if (user.role === MeetUserRole.ADMIN) {
		return next();
	}

	if (user.role === MeetUserRole.USER) {
		queryOptions.roomOwner = user.userId;
	}

	queryOptions.roomMember = user.userId;
	queryOptions.roomRegisteredAccess = true;
	res.locals.validatedQuery = queryOptions;
	return next();
};

/**
 * Middleware to authorize access (retrieval or deletion) for a single recording.
 *
 * - If a valid recordingSecret is provided in the query and `allowAccessWithSecret` is true,
 *   access is granted directly for retrieval requests.
 * - If no recordingSecret is provided, the recording's existence and permissions are checked
 *   based on the authenticated context (room member token or registered user).
 *
 * @param permission - The permission to check (canRetrieveRecordings or canDeleteRecordings).
 * @param allowAccessWithSecret - Whether to allow access based on a valid secret in the query.
 */
export const authorizeRecordingAccess = (
	permission: keyof MeetRoomMemberPermissions,
	allowAccessWithSecret = false
) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const recordingId = req.params.recordingId as string;
		const recordingSecret = req.query.recordingSecret as string | undefined;

		// If allowAccessWithSecret is true and a recordingSecret is provided,
		// we assume that the secret has been validated by setupRecordingAuthentication.
		// In that case, grant access directly for retrieval requests.
		if (allowAccessWithSecret && recordingSecret && permission === 'canRetrieveRecordings') {
			return next();
		}

		try {
			// Check recording existence and permissions based on the authenticated context
			const recordingService = container.get(RecordingService);
			await recordingService.validateRecordingAccess(recordingId, permission, ['roomId']);
			return next();
		} catch (error) {
			return handleError(res, error, 'checking recording permissions');
		}
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
			await recordingService.validateRecordingAccess(recordingId, 'canRecord', ['roomId']);
			return next();
		} catch (error) {
			return handleError(res, error, 'checking recording permissions');
		}
	}
};

type BulkRecordingFailed = { recordingId: string; error: string };

/**
 * Helper function to validate access for multiple recordings in bulk.
 *
 * - Checks if the authenticated user has the specified permission for each recording ID.
 * - Populates res.locals with the list of processable recording IDs and any failures.
 *
 * @param res - The Express response object.
 * @param permission - The permission to check for each recording (e.g., canRetrieveRecordings, canDeleteRecordings).
 */
const validateBulkRecordingAccess = async (
	res: Response,
	permission: keyof MeetRoomMemberPermissions
): Promise<void> => {
	const recordingService = container.get(RecordingService);
	const { recordingIds } = res.locals.validatedQuery as { recordingIds: string[] };

	const settledResults = await runConcurrently(
		recordingIds,
		async (recordingId) => {
			try {
				await recordingService.validateRecordingAccess(recordingId, permission, ['recordingId']);
				return recordingId;
			} catch (error) {
				const message = error instanceof OpenViduMeetError ? error.message : 'Unexpected error';
				throw { recordingId, error: message } as BulkRecordingFailed;
			}
		},
		{ concurrency: INTERNAL_CONFIG.CONCURRENCY_BULK_RETRIEVE_RECORDINGS }
	);

	const processableIds: string[] = [];
	const failed: BulkRecordingFailed[] = [];

	settledResults.forEach((result) => {
		if (result.status === 'fulfilled') {
			processableIds.push(result.value);
		} else {
			failed.push(result.reason as BulkRecordingFailed);
		}
	});

	res.locals.bulkValidation = { processableIds, failed };
};

export const validateBulkDeleteRecordingsAccess = async (_req: Request, res: Response, next: NextFunction) => {
	await validateBulkRecordingAccess(res, 'canDeleteRecordings');
	return next();
};

export const validateDownloadRecordingsAccess = async (_req: Request, res: Response, next: NextFunction) => {
	await validateBulkRecordingAccess(res, 'canRetrieveRecordings');
	return next();
};
