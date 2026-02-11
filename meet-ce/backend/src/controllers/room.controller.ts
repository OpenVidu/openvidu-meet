import {
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomDeletionSuccessCode,
	MeetRoomExtraField,
	MeetRoomField,
	MeetRoomFilters,
	MeetRoomOptions
} from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { handleError } from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';
import { RoomService } from '../services/room.service.js';
import { getBaseUrl } from '../utils/url.utils.js';

interface RequestWithValidatedHeaders extends Request {
	validatedHeaders?: {
		'x-fields'?: MeetRoomField[];
		'x-extrafields'?: MeetRoomExtraField[];
	};
}

export const createRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const options: MeetRoomOptions = req.body;
	const { validatedHeaders } = req as RequestWithValidatedHeaders;
	const fields = validatedHeaders?.['x-fields'];
	const extraFields = validatedHeaders?.['x-extrafields'];

	try {
		logger.verbose(`Creating room with options '${JSON.stringify(options)}'`);

		// Pass response options to service for consistent handling
		let room = await roomService.createMeetRoom(options);

		room = MeetRoomHelper.applyFieldFilters(room, fields, extraFields);
		room = MeetRoomHelper.addResponseMetadata(room);

		res.set('Location', `${getBaseUrl()}${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${room.roomId}`);
		return res.status(201).json(room);
	} catch (error) {
		handleError(res, error, 'creating room');
	}
};

export const getRooms = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const queryParams = req.query as MeetRoomFilters;

	logger.verbose(`Getting all rooms with filters: ${JSON.stringify(queryParams)}`);

	try {
		const fieldsForQuery = MeetRoomHelper.computeFieldsForRoomQuery(queryParams.fields, queryParams.extraFields);
		const optimizedQueryParams = { ...queryParams, fields: fieldsForQuery };

		const { rooms, isTruncated, nextPageToken } = await roomService.getAllMeetRooms(optimizedQueryParams);
		const maxItems = Number(queryParams.maxItems);

		// Add metadata at response root level (multiple rooms strategy)
		let response = { rooms, pagination: { isTruncated, nextPageToken, maxItems } };
		response = MeetRoomHelper.addResponseMetadata(response);
		return res.status(200).json(response);
	} catch (error) {
		handleError(res, error, 'getting rooms');
	}
};

export const getRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	const { roomId } = req.params;
	// Zod already validated and transformed to typed arrays
	const { fields, extraFields } = req.query as {
		fields?: MeetRoomField[];
		extraFields?: MeetRoomExtraField[];
	};

	try {
		logger.verbose(`Getting room '${roomId}' with filters: ${JSON.stringify({ fields, extraFields })}`);

		const roomService = container.get(RoomService);
		const fieldsForQuery = MeetRoomHelper.computeFieldsForRoomQuery(fields, extraFields);

		let room = await roomService.getMeetRoom(roomId, fieldsForQuery);

		// Apply permission filtering to the room based on the authenticated user's permissions
		const permissions = await roomService.getAuthenticatedRoomMemberPermissions(roomId);
		room = MeetRoomHelper.applyPermissionFiltering(room, permissions);

		room = MeetRoomHelper.addResponseMetadata(room);

		return res.status(200).json(room);
	} catch (error) {
		handleError(res, error, `getting room '${roomId}'`);
	}
};

export const deleteRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);

	const { roomId } = req.params;
	const { withMeeting, withRecordings } = req.query as {
		withMeeting: MeetRoomDeletionPolicyWithMeeting;
		withRecordings: MeetRoomDeletionPolicyWithRecordings;
	};

	try {
		logger.verbose(`Deleting room '${roomId}'`);
		const response = await roomService.deleteMeetRoom(roomId, withMeeting, withRecordings);

		// Add metadata to room if present in response
		if (response.room) {
			response.room = MeetRoomHelper.addResponseMetadata(response.room);
		}

		// Determine the status code based on the success code
		// If the room action is scheduled, return 202. Otherwise, return 200.
		const scheduledSuccessCodes = [
			MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_DELETED,
			MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_CLOSED,
			MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_AND_RECORDINGS_SCHEDULED_TO_BE_DELETED
		];
		const statusCode = scheduledSuccessCodes.includes(response.successCode) ? 202 : 200;

		logger.info(response.message);
		return res.status(statusCode).json(response);
	} catch (error) {
		handleError(res, error, `deleting room '${roomId}'`);
	}
};

export const bulkDeleteRooms = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);

	const { roomIds, withMeeting, withRecordings } = req.query as {
		roomIds: string[];
		withMeeting: MeetRoomDeletionPolicyWithMeeting;
		withRecordings: MeetRoomDeletionPolicyWithRecordings;
	};

	try {
		logger.verbose(`Deleting rooms: ${roomIds}`);
		const { successful, failed } = await roomService.bulkDeleteMeetRooms(roomIds, withMeeting, withRecordings);

		// Add metadata to each room object in successful/failed arrays
		successful.forEach((item) => {
			if (item.room) {
				item.room = MeetRoomHelper.addResponseMetadata(item.room);
			}
		});

		logger.info(
			`Bulk delete operation - Successfully processed rooms: ${successful.length}, failed to process: ${failed.length}`
		);

		if (failed.length === 0) {
			// All rooms were successfully processed
			return res.status(200).json({ message: 'All rooms successfully processed for deletion', successful });
		} else {
			// Some rooms failed to process
			const response = {
				message: `${failed.length} room(s) failed to process while deleting`,
				successful,
				failed
			};
			return res.status(400).json(response);
		}
	} catch (error) {
		handleError(res, error, `deleting rooms`);
	}
};

export const getRoomConfig = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const { roomId } = req.params;

	logger.verbose(`Getting room config for room '${roomId}'`);

	try {
		const { config } = await roomService.getMeetRoom(roomId, ['config']);
		return res.status(200).json(config);
	} catch (error) {
		handleError(res, error, `getting room config for room '${roomId}'`);
	}
};

export const updateRoomConfig = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const { config } = req.body;
	const { roomId } = req.params;

	logger.verbose(`Updating room config for room '${roomId}'`);

	try {
		await roomService.updateMeetRoomConfig(roomId, config);
		return res.status(200).json({ message: `Room config for room '${roomId}' updated successfully` });
	} catch (error) {
		handleError(res, error, `updating room config for room '${roomId}'`);
	}
};

export const updateRoomStatus = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const { status } = req.body;
	const { roomId } = req.params;

	logger.verbose(`Updating room status for room '${roomId}' to '${status}'`);

	try {
		const { room, updated } = await roomService.updateMeetRoomStatus(roomId, status);
		let message: string;

		if (updated) {
			message = `Room '${roomId}' ${status} successfully`;
		} else {
			message = `Room '${roomId}' scheduled to be closed when the meeting ends`;
		}

		return res.status(updated ? 200 : 202).json({ message, room });
	} catch (error) {
		handleError(res, error, `updating room status for room '${roomId}'`);
	}
};

export const updateRoomRoles = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const { roles } = req.body;
	const { roomId } = req.params;

	logger.verbose(`Updating roles permissions for room '${roomId}'`);

	try {
		await roomService.updateMeetRoomRoles(roomId, roles);
		return res.status(200).json({ message: `Roles permissions for room '${roomId}' updated successfully` });
	} catch (error) {
		handleError(res, error, `updating roles permissions for room '${roomId}'`);
	}
};

export const updateRoomAnonymous = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const { anonymous } = req.body;
	const { roomId } = req.params;

	logger.verbose(`Updating anonymous access config for room '${roomId}'`);

	try {
		await roomService.updateMeetRoomAnonymous(roomId, anonymous);
		return res.status(200).json({ message: `Anonymous access config for room '${roomId}' updated successfully` });
	} catch (error) {
		handleError(res, error, `updating anonymous access config for room '${roomId}'`);
	}
};
