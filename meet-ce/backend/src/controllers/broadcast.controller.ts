import type {
	MeetBroadcastBulkStopResponse,
	MeetBroadcastField,
	MeetBroadcastInfo,
	MeetBroadcastStartOptions
} from '@openvidu-meet/typings';
import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { applyHttpFieldFiltering } from '../helpers/field-filter.helper.js';
import { BroadcastHelper } from '../helpers/broadcast.helper.js';
import { handleError } from '../middlewares/error-handler.middleware.js';
import { BroadcastService } from '../services/broadcast.service.js';
import { LoggerService } from '../services/logger.service.js';

/** The broadcast limited to the fields the request asked for, or whole when it asked for none. */
const withRequestedFields = (res: Response, broadcast: MeetBroadcastInfo): MeetBroadcastInfo => {
	const { fields } = res.locals.validatedQuery as { fields?: MeetBroadcastField[] };
	return applyHttpFieldFiltering(broadcast, fields, undefined, []);
};

const asList = (res: Response, broadcasts: MeetBroadcastInfo[]) => ({
	broadcasts: broadcasts.map((broadcast) => withRequestedFields(res, broadcast))
});

export const startBroadcasts = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const broadcastService = container.get(BroadcastService);
	const { roomId, ...options } = req.body as MeetBroadcastStartOptions & { roomId: string };

	try {
		logger.info(`Starting broadcasts in room '${roomId}'`);
		const broadcasts = await broadcastService.startBroadcasts(roomId, options);
		return res.status(201).json(asList(res, broadcasts));
	} catch (error) {
		handleError(res, error, `starting broadcasts in room '${roomId}'`);
	}
};

export const stopBroadcast = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const broadcastService = container.get(BroadcastService);
	const { broadcastId } = req.params as Record<string, string>;

	try {
		logger.info(`Stopping broadcast '${broadcastId}'`);
		const broadcast = await broadcastService.stopBroadcast(BroadcastHelper.roomIdOf(broadcastId), broadcastId);
		return res.status(200).json(withRequestedFields(res, broadcast));
	} catch (error) {
		handleError(res, error, `stopping broadcast '${broadcastId}'`);
	}
};

export const bulkStopBroadcasts = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const broadcastService = container.get(BroadcastService);
	const { broadcastIds } = res.locals.validatedQuery as { broadcastIds: string[] };
	const { processableIds, failed: refused } = res.locals.bulkValidation as {
		processableIds: string[];
		failed: MeetBroadcastBulkStopResponse['failed'];
	};

	try {
		logger.info(`Stopping broadcasts ${String(broadcastIds)}`);
		const { stopped, failed } = await broadcastService.bulkStopBroadcasts(processableIds);
		const allFailed = [...refused, ...failed];
		const response: MeetBroadcastBulkStopResponse = {
			message:
				allFailed.length === 0
					? 'All broadcasts stopped successfully'
					: `${allFailed.length} broadcast(s) could not be stopped`,
			deleted: stopped,
			failed: allFailed
		};
		return res.status(allFailed.length === 0 ? 200 : 400).json(response);
	} catch (error) {
		handleError(res, error, 'stopping broadcasts');
	}
};

export const getBroadcasts = async (_req: Request, res: Response) => {
	const broadcastService = container.get(BroadcastService);
	const { roomId } = res.locals.validatedQuery as { roomId: string };

	try {
		const broadcasts = await broadcastService.getBroadcasts(roomId);
		return res.status(200).json(asList(res, broadcasts));
	} catch (error) {
		handleError(res, error, `getting broadcasts of room '${roomId}'`);
	}
};

export const getBroadcast = async (req: Request, res: Response) => {
	const broadcastService = container.get(BroadcastService);
	const { broadcastId } = req.params as Record<string, string>;

	try {
		const broadcast = await broadcastService.getBroadcast(BroadcastHelper.roomIdOf(broadcastId), broadcastId);
		return res.status(200).json(withRequestedFields(res, broadcast));
	} catch (error) {
		handleError(res, error, `getting broadcast '${broadcastId}'`);
	}
};
