import { MeetRecordingAccess, MeetRoom, OpenViduMeetPermissions, RecordingPermissions, UserRole } from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/index.js';
import { RecordingHelper } from '../helpers/index.js';
import { OpenViduMeetError } from '../models/error.model.js';
import { LoggerService, MeetStorageService, RoomService } from '../services/index.js';
import { allowAnonymous, recordingTokenValidator, tokenAndRoleValidator, withAuth } from './auth.middleware.js';

export const withRecordingEnabled = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);

	try {
		const roomId = extractRoomIdFromRequest(req);
		const room: MeetRoom = await roomService.getMeetRoom(roomId!);

		if (!room.preferences?.recordingPreferences?.enabled) {
			logger.debug(`Recording is disabled for room ${roomId}`);
			return res.status(403).json({
				message: 'Recording is disabled in this room'
			});
		}

		return next();
	} catch (error) {
		logger.error(`Error checking recording preferences: ${error}`);

		if (error instanceof OpenViduMeetError) {
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		return res.status(500).json({
			message: 'Unexpected error checking recording preferences'
		});
	}
};

export const withCanRecordPermission = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = extractRoomIdFromRequest(req);
	const payload = req.session?.tokenClaims;

	if (!payload) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	const sameRoom = payload.video?.room === roomId;
	const metadata = JSON.parse(payload.metadata || '{}');
	const permissions = metadata.permissions as OpenViduMeetPermissions | undefined;
	const canRecord = permissions?.canRecord;

	if (!sameRoom || !canRecord) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	return next();
};

export const withCanRetrieveRecordingsPermission = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = extractRoomIdFromRequest(req);
	const payload = req.session?.tokenClaims;

	// If there is no token, it is invoked using the API key, the user is admin or
	// the user is anonymous and recording access is public.
	// In this case, the user is allowed to access the resource
	if (!payload) {
		return next();
	}

	const sameRoom = roomId ? payload.video?.room === roomId : true;
	const metadata = JSON.parse(payload.metadata || '{}');
	const permissions = metadata.permissions as RecordingPermissions | undefined;
	const canRetrieveRecordings = permissions?.canRetrieveRecordings;

	if (!sameRoom || !canRetrieveRecordings) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	return next();
};

export const withCanDeleteRecordingsPermission = async (req: Request, res: Response, next: NextFunction) => {
	const roomId = extractRoomIdFromRequest(req);
	const payload = req.session?.tokenClaims;

	// If there is no token, the user is admin or it is invoked using the API key
	// In this case, the user is allowed to access the resource
	if (!payload) {
		return next();
	}

	const sameRoom = payload.video?.room === roomId;
	const metadata = JSON.parse(payload.metadata || '{}');
	const permissions = metadata.permissions as RecordingPermissions | undefined;
	const canDeleteRecordings = permissions?.canDeleteRecordings;

	if (!sameRoom || !canDeleteRecordings) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	return next();
};

/**
 * Middleware to configure authentication for retrieving recording media based on recording access.
 *
 * - Admin and recording token are always allowed
 * - If recording access is public, anonymous users are allowed
 */
export const configureRecordingMediaAuth = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);
	const storageService = container.get(MeetStorageService);

	let recordingAccess: MeetRecordingAccess;

	try {
		const roomId = extractRoomIdFromRequest(req);
		const room = await storageService.getArchivedRoomMetadata(roomId!);

		if (!room) {
			return res.status(404).json({
				message: 'Room metadata associated with the recording not found'
			});
		}

		recordingAccess = room.preferences!.recordingPreferences.allowAccessTo;
	} catch (error) {
		logger.error(`Error checking recording permissions: ${error}`);
		return res.status(500).json({
			message: 'Unexpected error checking recording permissions'
		});
	}

	const authValidators = [tokenAndRoleValidator(UserRole.ADMIN), recordingTokenValidator];

	if (recordingAccess === MeetRecordingAccess.PUBLIC) {
		authValidators.push(allowAnonymous);
	}

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
