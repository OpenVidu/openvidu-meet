import { container } from '../config/dependency-injector.config.js';
import { Request, Response } from 'express';
import { LoggerService } from '../services/logger.service.js';
import { OpenViduMeetError } from '../models/error.model.js';
import { RoomService, ParticipantService } from '../services/index.js';
import { MeetRoomFilters, MeetRoomOptions, MeetRoomRoleAndPermissions, ParticipantRole } from '@typings-ce';
import INTERNAL_CONFIG from '../config/internal-config.js';

export const createRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const options: MeetRoomOptions = req.body;

	try {
		logger.verbose(`Creating room with options '${JSON.stringify(options)}'`);
		const baseUrl = `${req.protocol}://${req.get('host')}`;

		const room = await roomService.createMeetRoom(baseUrl, options);
		res.set('Location', `${baseUrl}${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${room.roomId}`);
		return res.status(201).json(room);
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
		const { rooms, isTruncated, nextPageToken } = await roomService.getAllMeetRooms(queryParams);
		const maxItems = Number(queryParams.maxItems);
		return res.status(200).json({ rooms, pagination: { isTruncated, nextPageToken, maxItems } });
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
	const { force } = req.query;
	const forceDelete = force === 'true';

	try {
		logger.verbose(`Deleting room: ${roomId}`);

		const { deleted } = await roomService.bulkDeleteRooms([roomId], forceDelete);

		if (deleted.length > 0) {
			// Room was deleted
			return res.status(204).send();
		}

		// Room was marked as deleted
		return res.status(202).json({ message: `Room ${roomId} marked as deleted` });
	} catch (error) {
		logger.error(`Error deleting room: ${roomId}`);
		handleError(res, error);
	}
};

export const bulkDeleteRooms = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const { roomIds, force } = req.query;
	const forceDelete = force === 'true';
	logger.info(`Deleting rooms: ${roomIds}`);

	try {
		const roomIdsArray = roomIds as string[];

		const { deleted, markedForDeletion } = await roomService.bulkDeleteRooms(roomIdsArray, forceDelete);
		const isSingleRoom = roomIdsArray.length === 1;

		if (isSingleRoom) {
			// For a single room, no content is sent if fully deleted.
			if (deleted.length > 0) {
				return res.sendStatus(204);
			}

			// For a single room marked as deleted, return a message.
			return res.status(202).json({ message: `Room ${roomIdsArray[0]} marked as deleted` });
		}

		// For multiple rooms
		if (deleted.length > 0 && markedForDeletion.length === 0) {
			// All rooms were deleted
			return res.sendStatus(204);
		}

		if (deleted.length === 0 && markedForDeletion.length > 0) {
			// All rooms were marked as deleted
			return res
				.status(202)
				.json({ message: `Rooms ${markedForDeletion.join(', ')} marked for deletion`, markedForDeletion });
		}

		return res.status(200).json({ deleted, markedForDeletion });
	} catch (error) {
		logger.error(`Error deleting rooms: ${error}`);
		handleError(res, error);
	}
};

export const getRoomRolesAndPermissions = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const participantService = container.get(ParticipantService);

	const { roomId } = req.params;

	// Check if the room exists
	try {
		await roomService.getMeetRoom(roomId);
	} catch (error) {
		logger.error(`Error getting room '${roomId}'`);
		return handleError(res, error);
	}

	logger.verbose(`Getting roles and associated permissions for room '${roomId}'`);
	const moderatorPermissions = participantService.getParticipantPermissions(ParticipantRole.MODERATOR, roomId);
	const publisherPermissions = participantService.getParticipantPermissions(ParticipantRole.PUBLISHER, roomId);

	const rolesAndPermissions = [
		{
			role: ParticipantRole.MODERATOR,
			permissions: moderatorPermissions
		},
		{
			role: ParticipantRole.PUBLISHER,
			permissions: publisherPermissions
		}
	];
	res.status(200).json(rolesAndPermissions);
};

export const getRoomRoleAndPermissions = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const participantService = container.get(ParticipantService);

	const { roomId, secret } = req.params;

	try {
		logger.verbose(`Getting room role and associated permissions for room '${roomId}' and secret '${secret}'`);

		const role = await roomService.getRoomRoleBySecret(roomId, secret);
		const permissions = participantService.getParticipantPermissions(role, roomId);
		const roleAndPermissions: MeetRoomRoleAndPermissions = {
			role,
			permissions
		};
		return res.status(200).json(roleAndPermissions);
	} catch (error) {
		logger.error(`Error getting room role and permissions for room '${roomId}' and secret '${secret}'`);
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
