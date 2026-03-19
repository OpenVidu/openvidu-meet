import type { MeetParticipantModerationAction } from '@openvidu-meet/typings';
import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { handleError } from '../models/error.model.js';
import { LiveKitService } from '../services/livekit.service.js';
import { LoggerService } from '../services/logger.service.js';
import { RoomMemberService } from '../services/room-member.service.js';
import { RoomService } from '../services/room.service.js';

export const endMeeting = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const livekitService = container.get(LiveKitService);

	const { roomId } = req.params;

	// Check if the room exists
	try {
		await roomService.getMeetRoom(roomId, ['roomId']);
	} catch (error) {
		return handleError(res, error, `getting room '${roomId}'`);
	}

	try {
		logger.info(`Ending meeting from room '${roomId}'`);
		// To end a meeting, we need to delete the room from LiveKit
		await livekitService.deleteRoom(roomId);
		res.status(200).json({ message: `Meeting in room '${roomId}' ended successfully` });
	} catch (error) {
		handleError(res, error, `ending meeting from room '${roomId}'`);
	}
};

export const updateParticipantRole = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomMemberService = container.get(RoomMemberService);
	const { roomId, participantIdentity } = req.params;
	const { action } = req.body as { action: MeetParticipantModerationAction };

	try {
		logger.verbose(
			`Applying moderation action '${action}' for participant '${participantIdentity}' in room '${roomId}'`
		);
		await roomMemberService.updateParticipantRole(roomId, participantIdentity, action);
		res.status(200).json({
			message: `Moderation action '${action}' applied to participant '${participantIdentity}' in room '${roomId}'`
		});
	} catch (error) {
		handleError(
			res,
			error,
			`applying moderation action for participant '${participantIdentity}' in room '${roomId}'`
		);
	}
};

export const kickParticipantFromMeeting = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const roomService = container.get(RoomService);
	const roomMemberService = container.get(RoomMemberService);
	const { roomId, participantIdentity } = req.params;

	// Check if the room exists
	try {
		await roomService.getMeetRoom(roomId, ['roomId']);
	} catch (error) {
		return handleError(res, error, `getting room '${roomId}'`);
	}

	try {
		logger.verbose(`Kicking participant '${participantIdentity}' from room '${roomId}'`);
		await roomMemberService.kickParticipantFromMeeting(roomId, participantIdentity);
		res.status(200).json({
			message: `Participant '${participantIdentity}' kicked successfully from meeting in room '${roomId}'`
		});
	} catch (error) {
		handleError(res, error, `kicking participant '${participantIdentity}' from meeting in room '${roomId}'`);
	}
};
