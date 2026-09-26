import type {
	MeetBroadcastDestinationOptions,
	MeetBroadcastDestinationUpdateOptions,
	MeetBroadcastStartOptions
} from '@openvidu-meet/typings';
import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { handleError } from '../models/error.model.js';
import { BroadcastService } from '../services/broadcast.service.js';
import { LoggerService } from '../services/logger.service.js';
import { getBaseUrl } from '../utils/url.utils.js';

export const startBroadcast = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const broadcastService = container.get(BroadcastService);
	const { roomId } = req.params as Record<string, string>;
	const options = req.body as MeetBroadcastStartOptions;

	try {
		logger.info(`Starting broadcast in room '${roomId}'`);
		const broadcast = await broadcastService.startBroadcast(roomId, options);

		res.set(
			'Location',
			`${getBaseUrl()}${INTERNAL_CONFIG.API_BASE_PATH_V1}/meetings/${roomId}/broadcasts/${broadcast.broadcastId}`
		);
		return res.status(201).json(broadcast);
	} catch (error) {
		handleError(res, error, `starting broadcast in room '${roomId}'`);
	}
};

export const stopBroadcast = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const broadcastService = container.get(BroadcastService);
	const { roomId, broadcastId } = req.params as Record<string, string>;

	try {
		logger.info(`Stopping broadcast '${broadcastId}' in room '${roomId}'`);
		const broadcast = await broadcastService.stopBroadcast(roomId, broadcastId);
		return res.status(202).json(broadcast);
	} catch (error) {
		handleError(res, error, `stopping broadcast '${broadcastId}' in room '${roomId}'`);
	}
};

export const getBroadcasts = async (req: Request, res: Response) => {
	const broadcastService = container.get(BroadcastService);
	const { roomId } = req.params as Record<string, string>;

	try {
		const broadcasts = await broadcastService.getBroadcasts(roomId);
		return res.status(200).json({ broadcasts });
	} catch (error) {
		handleError(res, error, `getting broadcasts of room '${roomId}'`);
	}
};

export const getBroadcast = async (req: Request, res: Response) => {
	const broadcastService = container.get(BroadcastService);
	const { roomId, broadcastId } = req.params as Record<string, string>;

	try {
		const broadcast = await broadcastService.getBroadcast(roomId, broadcastId);
		return res.status(200).json(broadcast);
	} catch (error) {
		handleError(res, error, `getting broadcast '${broadcastId}' of room '${roomId}'`);
	}
};

export const addBroadcastDestination = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const broadcastService = container.get(BroadcastService);
	const { roomId, broadcastId } = req.params as Record<string, string>;
	const options = req.body as MeetBroadcastDestinationOptions;

	try {
		logger.info(`Adding a destination to broadcast '${broadcastId}' in room '${roomId}'`);
		const broadcast = await broadcastService.addDestination(roomId, broadcastId, options);
		return res.status(200).json(broadcast);
	} catch (error) {
		handleError(res, error, `adding a destination to broadcast '${broadcastId}' in room '${roomId}'`);
	}
};

export const updateBroadcastDestination = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const broadcastService = container.get(BroadcastService);
	const { roomId, broadcastId, destinationId } = req.params as Record<string, string>;
	const options = req.body as MeetBroadcastDestinationUpdateOptions;

	try {
		logger.info(`Updating destination '${destinationId}' of broadcast '${broadcastId}' in room '${roomId}'`);
		const broadcast = await broadcastService.updateDestination(roomId, broadcastId, destinationId, options);
		return res.status(200).json(broadcast);
	} catch (error) {
		handleError(
			res,
			error,
			`updating destination '${destinationId}' of broadcast '${broadcastId}' in room '${roomId}'`
		);
	}
};
