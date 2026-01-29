import { MeetRoomMemberFilters, MeetRoomMemberTokenOptions } from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { errorRoomMemberNotFound, handleError } from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';
import { RoomMemberService } from '../services/room-member.service.js';
import { getBaseUrl } from '../utils/url.utils.js';

export const createRoomMember = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomMemberService = container.get(RoomMemberService);

	const { roomId } = req.params;
	const memberOptions = req.body;

	try {
		logger.verbose(`Adding member in room '${roomId}'`);
		const member = await roomMemberService.createRoomMember(roomId, memberOptions);
		res.set(
			'Location',
			`${getBaseUrl()}${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/members/${member.memberId}`
		);
		return res.status(201).json(member);
	} catch (error) {
		handleError(res, error, `adding member in room '${roomId}'`);
	}
};

export const getRoomMembers = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomMemberService = container.get(RoomMemberService);

	const { roomId } = req.params;
	const filters = req.query as MeetRoomMemberFilters;

	try {
		logger.verbose(`Getting members for room '${roomId}'`);
		const { members, isTruncated, nextPageToken } = await roomMemberService.getAllRoomMembers(roomId, filters);
		const maxItems = Number(filters.maxItems);
		return res.status(200).json({ members, pagination: { isTruncated, nextPageToken, maxItems } });
	} catch (error) {
		handleError(res, error, `getting members for room '${roomId}'`);
	}
};

export const getRoomMember = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomMemberService = container.get(RoomMemberService);

	const { roomId, memberId } = req.params;

	try {
		logger.verbose(`Getting member '${memberId}' from room '${roomId}'`);
		const member = await roomMemberService.getRoomMember(roomId, memberId);

		if (!member) {
			throw errorRoomMemberNotFound(roomId, memberId);
		}

		return res.status(200).json(member);
	} catch (error) {
		handleError(res, error, `getting member '${memberId}' from room '${roomId}'`);
	}
};

export const updateRoomMember = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomMemberService = container.get(RoomMemberService);

	const { roomId, memberId } = req.params;
	const updates = req.body;

	try {
		logger.verbose(`Updating member '${memberId}' in room '${roomId}'`);
		const member = await roomMemberService.updateRoomMember(roomId, memberId, updates);
		return res.status(200).json(member);
	} catch (error) {
		handleError(res, error, `updating member '${memberId}' in room '${roomId}'`);
	}
};

export const deleteRoomMember = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomMemberService = container.get(RoomMemberService);

	const { roomId, memberId } = req.params;

	try {
		logger.verbose(`Deleting member '${memberId}' from room '${roomId}'`);
		await roomMemberService.deleteRoomMember(roomId, memberId);
		return res.status(200).json({ message: `Member '${memberId}' deleted successfully from room '${roomId}'` });
	} catch (error) {
		handleError(res, error, `deleting member '${memberId}' from room '${roomId}'`);
	}
};

export const bulkDeleteRoomMembers = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomMemberService = container.get(RoomMemberService);

	const { roomId } = req.params;
	const { memberIds } = req.query as { memberIds: string[] };

	try {
		logger.verbose(`Deleting members from room '${roomId}' with IDs: ${memberIds}`);
		const { deleted, failed } = await roomMemberService.bulkDeleteRoomMembers(roomId, memberIds);

		// All room members were successfully deleted
		if (deleted.length > 0 && failed.length === 0) {
			return res.status(200).json({ message: 'All room members deleted successfully', deleted });
		}

		// Some or all room members could not be deleted
		return res
			.status(400)
			.json({ message: `${failed.length} room member(s) could not be deleted`, deleted, failed });
	} catch (error) {
		handleError(res, error, `bulk deleting members from room '${roomId}'`);
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
