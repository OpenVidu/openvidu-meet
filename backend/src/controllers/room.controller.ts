import { MeetRoomFilters, MeetRoomOptions, MeetRoomRoleAndPermissions, ParticipantRole } from '@typings-ce';
import { Request, Response } from 'express';
import { container } from '../config/index.js';
import INTERNAL_CONFIG from '../config/internal-config.js';
import { MEET_RECORDING_TOKEN_EXPIRATION } from '../environment.js';
import { handleError } from '../models/error.model.js';
import { LoggerService, ParticipantService, RoomService } from '../services/index.js';
import { getCookieOptions } from '../utils/cookie-utils.js';

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
		handleError(res, error, 'creating room');
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
		handleError(res, error, 'getting rooms');
	}
};

export const getRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	const { roomId } = req.params;
	const fields = req.query.fields as string | undefined;

	try {
		logger.verbose(`Getting room '${roomId}'`);

		const roomService = container.get(RoomService);
		const room = await roomService.getMeetRoom(roomId, fields);

		return res.status(200).json(room);
	} catch (error) {
		handleError(res, error, `getting room '${roomId}'`);
	}
};

export const deleteRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);

	const { roomId } = req.params;
	const { force } = req.query;
	const forceDelete = force === 'true';

	try {
		logger.verbose(`Deleting room '${roomId}'`);

		const { deleted } = await roomService.bulkDeleteRooms([roomId], forceDelete);

		if (deleted.length > 0) {
			// Room was deleted
			return res.status(204).send();
		}

		// Room was marked as deleted
		return res.status(202).json({ message: `Room '${roomId}' marked for deletion` });
	} catch (error) {
		handleError(res, error, `deleting room '${roomId}'`);
	}
};

export const bulkDeleteRooms = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const { roomIds, force } = req.query;
	const forceDelete = force === 'true';
	logger.verbose(`Deleting rooms: ${roomIds}`);

	try {
		const roomIdsArray = roomIds as string[];

		const { deleted, markedForDeletion } = await roomService.bulkDeleteRooms(roomIdsArray, forceDelete);

		logger.info(`Deleted rooms: ${deleted.length}, marked for deletion: ${markedForDeletion.length}`);

		// All rooms were deleted
		if (deleted.length > 0 && markedForDeletion.length === 0) {
			return res.sendStatus(204);
		}

		// All room were marked for deletion
		if (deleted.length === 0 && markedForDeletion.length > 0) {
			const message =
				markedForDeletion.length === 1
					? `Room '${markedForDeletion[0]}' marked for deletion`
					: `Rooms '${markedForDeletion.join(', ')}' marked for deletion`;

			return res.status(202).json({ message });
		}

		// Mixed result (some rooms deleted, some marked for deletion)
		return res.status(200).json({ deleted, markedForDeletion });
	} catch (error) {
		handleError(res, error, `deleting rooms`);
	}
};

export const updateRoomPreferences = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const roomPreferences = req.body;
	const { roomId } = req.params;

	logger.verbose(`Updating room preferences for room '${roomId}'`);

	try {
		const room = await roomService.updateMeetRoomPreferences(roomId, roomPreferences);
		return res.status(200).json(room);
	} catch (error) {
		handleError(res, error, `updating room preferences for room '${roomId}'`);
	}
};

export const generateRecordingToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const { roomId } = req.params;
	const { secret } = req.body;

	logger.verbose(`Generating recording token for room '${roomId}'`);

	try {
		const token = await roomService.generateRecordingToken(roomId, secret);

		res.cookie(
			INTERNAL_CONFIG.RECORDING_TOKEN_COOKIE_NAME,
			token,
			getCookieOptions('/', MEET_RECORDING_TOKEN_EXPIRATION)
		);
		return res.status(200).json({ token });
	} catch (error) {
		handleError(res, error, `generating recording token for room '${roomId}'`);
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
		return handleError(res, error, `getting room '${roomId}'`);
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
		handleError(res, error, `getting room role and permissions for room '${roomId}' and secret '${secret}'`);
	}
};

export const getRoomPreferences = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const { roomId } = req.params;

	logger.verbose(`Getting room preferences for room '${roomId}'`);

	try {
		const { preferences } = await roomService.getMeetRoom(roomId);
		return res.status(200).json(preferences);
	} catch (error) {
		handleError(res, error, `getting room preferences for room '${roomId}'`);
	}
};
