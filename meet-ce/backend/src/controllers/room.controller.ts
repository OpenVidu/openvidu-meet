import type {
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomExtraField,
	MeetRoomField,
	MeetRoomOptions
} from '@openvidu-meet/typings';
import { MeetRoomDeletionSuccessCode } from '@openvidu-meet/typings';
import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { handleError, internalError } from '../models/error.model.js';
import type { MeetRoomDeletionOptions } from '../models/request-context.model.js';
import { LoggerService } from '../services/logger.service.js';
import { RoomService } from '../services/room.service.js';
import type { MeetRoomRepositoryQueryWithFields } from '../types/room-projection.types.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { getBaseUrl } from '../utils/url.utils.js';

export const createRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const options: MeetRoomOptions = req.body;
	// Fields are merged from headers into req.query by the middleware
	const { fields, extraFields } = res.locals.validatedQuery as {
		fields?: MeetRoomField[];
		extraFields?: MeetRoomExtraField[];
	};

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

export const getRooms = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const queryParams = res.locals.validatedQuery as MeetRoomRepositoryQueryWithFields;

	logger.verbose(`Getting all rooms with filters: ${JSON.stringify(queryParams)}`);

	try {
		const fieldsForQuery = MeetRoomHelper.computeFieldsForRoomQuery(
			queryParams.fields ? [...queryParams.fields] : undefined,
			queryParams.extraFields
		);
		const optimizedQueryParams: MeetRoomRepositoryQueryWithFields = { ...queryParams, fields: fieldsForQuery };

		const { rooms, isTruncated, nextPageToken } = await roomService.getAllMeetRooms(optimizedQueryParams);
		const filteredRooms = await runConcurrently(
			rooms,
			async (room) => {
				if (!room.roomId) {
					throw internalError('applying permission filtering to rooms without roomId');
				}

				const permissions = await roomService.getAuthenticatedRoomMemberPermissions(room.roomId);
				return MeetRoomHelper.applyPermissionFiltering(room, permissions);
			},
			{ concurrency: 20, failFast: true }
		);
		const maxItems = Number(queryParams.maxItems);

		// Add metadata at response root level (multiple rooms strategy)
		let response = { rooms: filteredRooms, pagination: { isTruncated, nextPageToken, maxItems } };
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
	const { fields, extraFields } = res.locals.validatedQuery as {
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
	const { fields, extraFields, withMeeting, withRecordings } = res.locals.validatedQuery as {
		fields?: MeetRoomField[];
		extraFields?: MeetRoomExtraField[];
		withMeeting: MeetRoomDeletionPolicyWithMeeting;
		withRecordings: MeetRoomDeletionPolicyWithRecordings;
	};

	try {
		logger.verbose(`Deleting room '${roomId}'`);
		const deleteOpts: MeetRoomDeletionOptions = {
			withMeeting,
			withRecordings,
			fields: MeetRoomHelper.computeFieldsForRoomQuery(fields, extraFields)
		};
		const response = await roomService.deleteMeetRoom(roomId, deleteOpts);

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

	const { roomIds, fields, extraFields, withMeeting, withRecordings } = res.locals.validatedQuery as {
		roomIds: string[];
		fields?: MeetRoomField[];
		extraFields?: MeetRoomExtraField[];
		withMeeting: MeetRoomDeletionPolicyWithMeeting;
		withRecordings: MeetRoomDeletionPolicyWithRecordings;
	};

	try {
		logger.verbose(`Deleting rooms: ${roomIds} with options: ${JSON.stringify(res.locals.validatedQuery)}`);

		const deleteOpts: MeetRoomDeletionOptions = {
			withMeeting,
			withRecordings,
			fields: MeetRoomHelper.computeFieldsForRoomQuery(fields, extraFields)
		};
		const { successful, failed } = await roomService.bulkDeleteMeetRooms(roomIds, deleteOpts);

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

export const updateRoomAccess = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const { access } = req.body;
	const { roomId } = req.params;

	logger.verbose(`Updating access config for room '${roomId}'`);

	try {
		await roomService.updateMeetRoomAccess(roomId, access);
		return res.status(200).json({ message: `Access config for room '${roomId}' updated successfully` });
	} catch (error) {
		handleError(res, error, `updating access config for room '${roomId}'`);
	}
};
