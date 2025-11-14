import {
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomDeletionSuccessCode,
	MeetRoomFilters,
	MeetRoomMemberRole,
	MeetRoomMemberRoleAndPermissions,
	MeetRoomMemberTokenOptions,
	MeetRoomOptions
} from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import { container } from '../config/index.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { handleError } from '../models/error.model.js';
import { LoggerService, RoomMemberService, RoomService } from '../services/index.js';
import { getBaseUrl } from '../utils/index.js';

export const createRoom = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const options: MeetRoomOptions = req.body;

	try {
		logger.verbose(`Creating room with options '${JSON.stringify(options)}'`);

		const room = await roomService.createMeetRoom(options);
		res.set('Location', `${getBaseUrl()}${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${room.roomId}`);
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
	const { withMeeting, withRecordings } = req.query as {
		withMeeting: MeetRoomDeletionPolicyWithMeeting;
		withRecordings: MeetRoomDeletionPolicyWithRecordings;
	};

	try {
		logger.verbose(`Deleting room '${roomId}'`);
		const response = await roomService.deleteMeetRoom(roomId, withMeeting, withRecordings);

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

		logger.info(
			`Bulk delete operation - Successfully processed rooms: ${successful.length}, failed to process: ${failed.length}`
		);

		if (failed.length === 0) {
			// All rooms were successfully processed
			return res.status(200).json({ message: 'All rooms successfully processed for deletion', successful });
		} else {
			// Some rooms failed to process
			return res
				.status(400)
				.json({ message: `${failed.length} room(s) failed to process while deleting`, successful, failed });
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
		const { config } = await roomService.getMeetRoom(roomId);
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

export const generateRoomMemberToken = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomMemberTokenService = container.get(RoomMemberService);

	const { roomId } = req.params;
	const tokenOptions: MeetRoomMemberTokenOptions = req.body;

	try {
		logger.verbose(`Generating room member token for room '${roomId}'`);
		const token = await roomMemberTokenService.generateOrRefreshRoomMemberToken(roomId, tokenOptions);
		return res.status(200).json({ token });
	} catch (error) {
		handleError(res, error, `generating room member token for room '${roomId}'`);
	}
};

export const getRoomMemberRolesAndPermissions = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const roomMemberService = container.get(RoomMemberService);

	const { roomId } = req.params;

	// Check if the room exists
	try {
		await roomService.getMeetRoom(roomId);
	} catch (error) {
		return handleError(res, error, `getting room '${roomId}'`);
	}

	logger.verbose(`Getting room member roles and associated permissions for room '${roomId}'`);
	const moderatorPermissions = await roomMemberService.getRoomMemberPermissions(roomId, MeetRoomMemberRole.MODERATOR);
	const speakerPermissions = await roomMemberService.getRoomMemberPermissions(roomId, MeetRoomMemberRole.SPEAKER);

	const rolesAndPermissions: MeetRoomMemberRoleAndPermissions[] = [
		{
			role: MeetRoomMemberRole.MODERATOR,
			permissions: moderatorPermissions
		},
		{
			role: MeetRoomMemberRole.SPEAKER,
			permissions: speakerPermissions
		}
	];
	res.status(200).json(rolesAndPermissions);
};

export const getRoomMemberRoleAndPermissions = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomMemberService = container.get(RoomMemberService);

	const { roomId, secret } = req.params;

	try {
		logger.verbose(
			`Getting room member role and associated permissions for room '${roomId}' and secret '${secret}'`
		);

		const role = await roomMemberService.getRoomMemberRoleBySecret(roomId, secret);
		const permissions = await roomMemberService.getRoomMemberPermissions(roomId, role);
		const roleAndPermissions: MeetRoomMemberRoleAndPermissions = {
			role,
			permissions
		};
		return res.status(200).json(roleAndPermissions);
	} catch (error) {
		handleError(res, error, `getting room member role and permissions for room '${roomId}' and secret '${secret}'`);
	}
};
