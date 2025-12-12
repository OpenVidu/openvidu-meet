import { MeetRoomMemberTokenOptions } from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { handleError } from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';
import { RoomMemberService } from '../services/room-member.service.js';

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
