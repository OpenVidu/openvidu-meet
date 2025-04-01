import { container } from '../config/dependency-injector.config.js';
import { Request, Response } from 'express';
import { LoggerService } from '../services/logger.service.js';
import { OpenViduMeetError } from '../models/error.model.js';
import { RoomService } from '../services/room.service.js';
import { MeetRoomOptions } from '@typings-ce';

export const createRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const options: MeetRoomOptions = req.body;

	try {
		logger.verbose(`Creating room with options '${JSON.stringify(options)}'`);
		const baseUrl = `${req.protocol}://${req.get('host')}`;

		const room = await roomService.createMeetRoom(baseUrl, options);
		return res.status(200).json(room);
	} catch (error) {
		logger.error(`Error creating room with options '${JSON.stringify(options)}'`);
		handleError(res, error);
	}
};

export const getRooms = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const fields = req.query.fields as string[] | undefined;

	try {
		logger.verbose('Getting rooms');

		const roomService = container.get(RoomService);
		const rooms = await roomService.listOpenViduRooms();

		if (fields && fields.length > 0) {
			const filteredRooms = rooms.map((room) => filterObjectFields(room, fields));
			return res.status(200).json(filteredRooms);
		}

		return res.status(200).json(rooms);
	} catch (error) {
		logger.error('Error getting rooms');
		handleError(res, error);
	}
};

export const getRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	const { roomId } = req.params;
	const fields = req.query.fields as string[] | undefined;

	try {
		logger.verbose(`Getting room with id '${roomId}'`);

		const roomService = container.get(RoomService);
		const room = await roomService.getMeetRoom(roomId);

		if (fields && fields.length > 0) {
			const filteredRoom = filterObjectFields(room, fields);
			return res.status(200).json(filteredRoom);
		}

		return res.status(200).json(room);
	} catch (error) {
		logger.error(`Error getting room with id '${roomId}'`);
		handleError(res, error);
	}
};

export const deleteRooms = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);

	const { roomId } = req.params;
	const { roomIds } = req.body;

	const roomsToDelete = roomId ? [roomId] : roomIds;

	// TODO: Validate roomIds with ZOD
	if (!Array.isArray(roomsToDelete) || roomsToDelete.length === 0) {
		return res.status(400).json({ error: 'roomIds must be a non-empty array' });
	}

	try {
		logger.verbose(`Deleting rooms: ${roomsToDelete.join(', ')}`);

		await roomService.deleteRooms(roomsToDelete);
		logger.info(`Rooms deleted: ${roomsToDelete.join(', ')}`);
		return res.status(200).json({ message: 'Rooms deleted', deletedRooms: roomsToDelete });
	} catch (error) {
		logger.error(`Error deleting rooms: ${roomsToDelete.join(', ')}`);
		handleError(res, error);
	}
};

export const getParticipantRole = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);

	const { roomId } = req.params;
	const { secret } = req.query as { secret: string };

	try {
		logger.verbose(`Getting participant role for room '${roomId}'`);

		const role = await roomService.getRoomSecretRole(roomId, secret);
		return res.status(200).json(role);
	} catch (error) {
		logger.error(`Error getting participant role for room '${roomId}'`);
		handleError(res, error);
	}
};

export const updateRoomPreferences = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	logger.verbose(`Updating room preferences: ${JSON.stringify(req.body)}`);
	// const { roomName, roomPreferences } = req.body;

	// try {
	// 	const preferenceService = container.get(GlobalPreferencesService);
	// 	preferenceService.validateRoomPreferences(roomPreferences);

	// 	const savedPreferences = await preferenceService.updateOpenViduRoomPreferences(roomName, roomPreferences);

	// 	return res
	// 		.status(200)
	// 		.json({ message: 'Room preferences updated successfully.', preferences: savedPreferences });
	// } catch (error) {
	// 	if (error instanceof OpenViduCallError) {
	// 		logger.error(`Error saving room preferences: ${error.message}`);
	// 		return res.status(error.statusCode).json({ name: error.name, message: error.message });
	// 	}

	// 	logger.error('Error saving room preferences:' + error);
	// 	return res.status(500).json({ message: 'Error saving room preferences', error });
	// }
};

const filterObjectFields = (obj: Record<string, any>, fields: string[]): Record<string, any> => {
	return fields.reduce(
		(acc, field) => {
			if (Object.prototype.hasOwnProperty.call(obj, field)) {
				acc[field] = obj[field];
			}

			return acc;
		},
		{} as Record<string, any>
	);
};

const handleError = (res: Response, error: OpenViduMeetError | unknown) => {
	const logger = container.get(LoggerService);
	logger.error(String(error));

	if (error instanceof OpenViduMeetError) {
		res.status(error.statusCode).json({ name: error.name, message: error.message });
	} else {
		res.status(500).json({ name: 'Room Error', message: 'Internal server error. Room operation failed' });
	}
};
