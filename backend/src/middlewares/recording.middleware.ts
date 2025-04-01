import { container } from '../config/dependency-injector.config.js';
import { Request, Response, NextFunction } from 'express';
import { OpenViduMeetPermissions, MeetRoom } from '@typings-ce';
import { LoggerService } from '../services/logger.service.js';
import { RoomService } from '../services/room.service.js';
import { RecordingHelper } from '../helpers/recording.helper.js';

export const withRecordingEnabled = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);
	const roomIdParam = req.body.roomId;
	let roomId: string;

	// Extract roomId from body or from recordingId
	if (roomIdParam) {
		roomId = roomIdParam as string;
	} else {
		const recordingId = req.params.recordingId as string;
		({ roomId } = RecordingHelper.extractInfoFromRecordingId(recordingId));
	}

	let room: MeetRoom;

	try {
		const roomService = container.get(RoomService);
		room = await roomService.getMeetRoom(roomId);
	} catch (error) {
		logger.error('Error checking recording preferences:' + error);
		return res.status(403).json({ message: 'Recording is disabled in this room' });
	}

	if (!room.preferences) {
		logger.error('No room preferences found checking recording preferences. Refusing access');
		return res.status(403).json({ message: 'Recording is disabled in this room' });
	}

	const { recordingPreferences } = room.preferences;
	const { enabled: recordingEnabled } = recordingPreferences;

	if (!recordingEnabled) {
		return res.status(403).json({ message: 'Recording is disabled in this room' });
	}

	return next();
};

export const withCorrectPermissions = async (req: Request, res: Response, next: NextFunction) => {
	const roomIdParam = req.body.roomId;
	let roomId: string;

	// Extract roomId from body or from recordingId
	if (roomIdParam) {
		roomId = roomIdParam as string;
	} else {
		const recordingId = req.params.recordingId as string;
		({ roomId } = RecordingHelper.extractInfoFromRecordingId(recordingId));
	}

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
