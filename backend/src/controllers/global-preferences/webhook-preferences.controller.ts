import { WebhookPreferences } from '@typings-ce';
import { Request, Response } from 'express';
import { container } from '../../config/index.js';
import { handleError } from '../../models/error.model.js';
import { LoggerService, MeetStorageService } from '../../services/index.js';

export const updateWebhookPreferences = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const globalPrefService = container.get(MeetStorageService);

	logger.verbose(`Updating webhooks preferences: ${JSON.stringify(req.body)}`);
	const webhookPreferences = req.body as WebhookPreferences;

	try {
		const globalPreferences = await globalPrefService.getGlobalPreferences();
		globalPreferences.webhooksPreferences = webhookPreferences;
		await globalPrefService.saveGlobalPreferences(globalPreferences);

		return res.status(200).json({ message: 'Webhooks preferences updated successfully' });
	} catch (error) {
		handleError(res, error, 'updating webhooks preferences');
	}
};

export const getWebhookPreferences = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const preferenceService = container.get(MeetStorageService);

	logger.verbose('Getting webhooks preferences');

	try {
		const preferences = await preferenceService.getGlobalPreferences();
		return res.status(200).json(preferences.webhooksPreferences);
	} catch (error) {
		handleError(res, error, 'getting webhooks preferences');
	}
};
