import { MeetRoom, OpenViduMeetPermissions } from '@typings-ce';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/index.js';
import { RecordingHelper } from '../helpers/index.js';
import { OpenViduMeetError } from '../models/error.model.js';
import { LoggerService, RoomService } from '../services/index.js';

const extractRoomIdFromRequest = (req: Request): string => {
	if (req.body.roomId) {
		return req.body.roomId as string;
	}

	// If roomId is not in the body, check if it's in the params
	const recordingId = req.params.recordingId as string;

	const { roomId } = RecordingHelper.extractInfoFromRecordingId(recordingId);
	return roomId;
};

export const withRecordingEnabled = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);

	try {
		const roomId = extractRoomIdFromRequest(req);

		const room: MeetRoom = await roomService.getMeetRoom(roomId);

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
			message: 'Unexpected error checking recording permissions'
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
	const canRecord = permissions?.canRecord === true;

	if (!sameRoom || !canRecord) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	return next();
};
