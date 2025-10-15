import { MeetAppearanceConfig } from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import { container } from '../../config/index.js';
import { handleError } from '../../models/error.model.js';
import { LoggerService, MeetStorageService } from '../../services/index.js';

export const updateRoomsAppearanceConfig = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const storageService = container.get(MeetStorageService);

	logger.verbose(`Updating rooms appearance config: ${JSON.stringify(req.body)}`);
	const appearanceConfig = req.body as { appearance: MeetAppearanceConfig };

	try {
		const globalConfig = await storageService.getGlobalConfig();

		if (globalConfig.roomsConfig.appearance.themes.length > 0) {
			// Preserve existing theme colors if they are not provided in the update
			const existingTheme = globalConfig.roomsConfig.appearance.themes[0];
			const newTheme = appearanceConfig.appearance.themes[0];

			newTheme.backgroundColor = newTheme.backgroundColor || existingTheme.backgroundColor;
			newTheme.primaryColor = newTheme.primaryColor || existingTheme.primaryColor;
			newTheme.secondaryColor = newTheme.secondaryColor || existingTheme.secondaryColor;
			newTheme.accentColor = newTheme.accentColor || existingTheme.accentColor;
			newTheme.surfaceColor = newTheme.surfaceColor || existingTheme.surfaceColor;
		}

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
		const appearanceConfig = globalConfig.roomsConfig.appearance;
		return res.status(200).json({ appearance: appearanceConfig });
	} catch (error) {
		handleError(res, error, 'getting rooms appearance config');
	}
};
