import { container } from '../config/dependency-injector.config.js';
import { Request, Response, NextFunction } from 'express';
import { OpenViduMeetPermissions, OpenViduMeetRoom } from '@typings-ce';
import { LoggerService } from '../services/logger.service.js';
import { RoomService } from '../services/room.service.js';

export const withRecordingEnabledAndCorrectPermissions = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);

	// TODO: Think how to get the roomName from the request
	const roomName = req.body.roomName;
	const payload = req.session?.tokenClaims;

	if (!payload) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	let room: OpenViduMeetRoom;

	try {
		const roomService = container.get(RoomService);
		room = await roomService.getOpenViduRoom(roomName);
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

	const sameRoom = payload.video?.room === roomName;
	const metadata = JSON.parse(payload.metadata || '{}');
	const permissions = metadata.permissions as OpenViduMeetPermissions | undefined;
	const canRecord = permissions?.canRecord === true;

	if (!sameRoom || !canRecord) {
		return res.status(403).json({ message: 'Insufficient permissions to access this resource' });
	}

	return next();
};
