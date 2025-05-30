import { SecurityPreferences } from '@typings-ce';
import { Request, Response } from 'express';
import { container } from '../../config/index.js';
import { handleError } from '../../models/error.model.js';
import { LoggerService, MeetStorageService } from '../../services/index.js';

export const updateSecurityPreferences = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const globalPrefService = container.get(MeetStorageService);

	logger.verbose(`Updating security preferences: ${JSON.stringify(req.body)}`);
	const securityPreferences = req.body as SecurityPreferences;

	try {
		const globalPreferences = await globalPrefService.getGlobalPreferences();
		const currentAuth = globalPreferences.securityPreferences.authentication;
		const newAuth = securityPreferences.authentication;

		currentAuth.authMethod = newAuth.authMethod;
		currentAuth.authModeToAccessRoom = newAuth.authModeToAccessRoom;
		await globalPrefService.saveGlobalPreferences(globalPreferences);

		return res.status(200).json({ message: 'Security preferences updated successfully' });
	} catch (error) {
		handleError(res, error, 'updating security preferences');
	}
};

export const getSecurityPreferences = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const preferenceService = container.get(MeetStorageService);

	logger.verbose('Getting security preferences');

	try {
		const preferences = await preferenceService.getGlobalPreferences();
		const securityPreferences = preferences.securityPreferences;
		return res.status(200).json(securityPreferences);
	} catch (error) {
		handleError(res, error, 'getting security preferences');
	}
};
