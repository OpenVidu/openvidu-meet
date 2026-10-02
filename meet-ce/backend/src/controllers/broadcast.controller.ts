import type {
	MeetBroadcastField,
	MeetBroadcastInfo,
	MeetBroadcastStartOptions,
	MeetBroadcastStopOptions
} from '@openvidu-meet/typings';
import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { applyHttpFieldFiltering } from '../helpers/field-filter.helper.js';
import { handleError } from '../models/error.model.js';
import { BroadcastService } from '../services/broadcast.service.js';
import { LoggerService } from '../services/logger.service.js';

/** The broadcast limited to the fields the request asked for, or whole when it asked for none. */
const withRequestedFields = (res: Response, broadcast: MeetBroadcastInfo): MeetBroadcastInfo => {
	const { fields } = res.locals.validatedQuery as { fields?: MeetBroadcastField[] };
	return applyHttpFieldFiltering(broadcast, fields, undefined, []);
};

export const startBroadcasts = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const broadcastService = container.get(BroadcastService);
	const { roomId } = req.params as Record<string, string>;
	const options = req.body as MeetBroadcastStartOptions;

	try {
		logger.info(`Starting broadcasts in room '${roomId}'`);
		const broadcasts = await broadcastService.startBroadcasts(roomId, options);
		return res.status(201).json({ broadcasts: broadcasts.map((broadcast) => withRequestedFields(res, broadcast)) });
	} catch (error) {
		handleError(res, error, `starting broadcasts in room '${roomId}'`);
	}
};

export const stopBroadcasts = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const broadcastService = container.get(BroadcastService);
	const { roomId } = req.params as Record<string, string>;
	const options = req.body as MeetBroadcastStopOptions;

	try {
		logger.info(`Stopping broadcasts in room '${roomId}'`);
		const broadcasts = await broadcastService.stopBroadcasts(roomId, options);
		return res.status(200).json({ broadcasts: broadcasts.map((broadcast) => withRequestedFields(res, broadcast)) });
	} catch (error) {
		handleError(res, error, `stopping broadcasts in room '${roomId}'`);
	}
};

export const getBroadcasts = async (req: Request, res: Response) => {
	const broadcastService = container.get(BroadcastService);
	const { roomId } = req.params as Record<string, string>;

	try {
		const broadcasts = await broadcastService.getBroadcasts(roomId);
		return res.status(200).json({ broadcasts: broadcasts.map((broadcast) => withRequestedFields(res, broadcast)) });
	} catch (error) {
		handleError(res, error, `getting broadcasts of room '${roomId}'`);
	}
};

export const getBroadcast = async (req: Request, res: Response) => {
	const broadcastService = container.get(BroadcastService);
	const { roomId, broadcastId } = req.params as Record<string, string>;

	try {
		const broadcast = await broadcastService.getBroadcast(roomId, broadcastId);
		return res.status(200).json(withRequestedFields(res, broadcast));
	} catch (error) {
		handleError(res, error, `getting broadcast '${broadcastId}' of room '${roomId}'`);
	}
};
