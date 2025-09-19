import { MeetAppearanceConfig } from '@typings-ce';
import { Request, Response } from 'express';
import { container } from '../../config/index.js';
import {
	errorRoomsAppearanceConfigNotDefined,
	handleError,
	rejectRequestFromMeetError
} from '../../models/error.model.js';
import { LoggerService, MeetStorageService } from '../../services/index.js';

export const updateRoomsAppearanceConfig = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const storageService = container.get(MeetStorageService);

	logger.verbose(`Updating rooms appearance config: ${JSON.stringify(req.body)}`);
	const appearanceConfig = req.body as { appearance: MeetAppearanceConfig };

	try {
		const globalConfig = await storageService.getGlobalConfig();
		globalConfig.roomsConfig = appearanceConfig;
		await storageService.saveGlobalConfig(globalConfig);

		return res.status(200).json({ message: 'Rooms appearance config updated successfully' });
	} catch (error) {
		handleError(res, error, 'updating rooms appearance config');
	}
};

export const getRoomsAppearanceConfig = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const storageService = container.get(MeetStorageService);

	logger.verbose(`Getting rooms appearance config`);

	try {
		const globalConfig = await storageService.getGlobalConfig();
		const appearanceConfig = globalConfig.roomsConfig?.appearance;

		if (!appearanceConfig) {
			const error = errorRoomsAppearanceConfigNotDefined();
			return rejectRequestFromMeetError(res, error);
		}

		return res.status(200).json({ appearance: appearanceConfig });
	} catch (error) {
		handleError(res, error, 'getting rooms appearance config');
	}
};
