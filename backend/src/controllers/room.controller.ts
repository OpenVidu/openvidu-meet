import { container } from '../config/dependency-injector.config.js';
import { Request, Response } from 'express';
import { LoggerService } from '../services/logger.service.js';
import { OpenViduMeetError } from '../models/error.model.js';
import { RoomService } from '../services/room.service.js';
import { MeetRoomFilters, MeetRoomOptions } from '@typings-ce';

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
	const roomService = container.get(RoomService);
	const queryParams = req.query as unknown as MeetRoomFilters;

	logger.verbose('Getting all rooms');

	try {
		const response = await roomService.getAllMeetRooms(queryParams);

		return res.status(200).json(response);
	} catch (error) {
		logger.error('Error getting rooms');
		handleError(res, error);
	}
};

export const getRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	const { roomId } = req.params;
	const fields = req.query.fields as string | undefined;

	try {
		logger.verbose(`Getting room with id '${roomId}'`);

		const roomService = container.get(RoomService);
		const room = await roomService.getMeetRoom(roomId, fields);

		return res.status(200).json(room);
	} catch (error) {
		logger.error(`Error getting room with id '${roomId}'`);
		handleError(res, error);
	}
};

export const deleteRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);

	const { roomId } = req.params;

	try {
		logger.verbose(`Deleting room: ${roomId}`);

		await roomService.bulkDeleteRooms([roomId]);
		logger.info(`Room deleted: ${roomId}`);
		return res.status(204).json();
	} catch (error) {
		logger.error(`Error deleting room: ${roomId}`);
		handleError(res, error);
	}
};

export const bulkDeleteRooms = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const { roomIds } = req.query;

	logger.info(`Deleting rooms: ${roomIds}`);

	try {
		const roomIdsArray = (roomIds as string).split(',');
		 await roomService.bulkDeleteRooms(roomIdsArray);

		return res.status(204).send();
	} catch (error) {
		logger.error(`Error deleting rooms: ${error}`);
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
	const roomService = container.get(RoomService);
	const roomPreferences = req.body;
	const { roomId } = req.params;

	logger.verbose(`Updating room preferences`);

	try {
		const room = await roomService.updateMeetRoomPreferences(roomId, roomPreferences);
		return res.status(200).json(room);
	} catch (error) {
		logger.error(`Error saving room preferences: ${error}`);
		handleError(res, error);
	}
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
