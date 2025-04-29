import { WebhookPreferences } from '@typings-ce';
import { Request, Response } from 'express';
import { container } from '../../config/index.js';
import { OpenViduMeetError } from '../../models/error.model.js';
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
		if (error instanceof OpenViduMeetError) {
			logger.error(`Error updating webhooks preferences: ${error.message}`);
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		logger.error('Error updating webhooks preferences:' + error);
		return res.status(500).json({ message: 'Error updating webhooks preferences' });
	}
};

export const getWebhookPreferences = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const preferenceService = container.get(MeetStorageService);

	try {
		const preferences = await preferenceService.getGlobalPreferences();

		if (!preferences) {
			//TODO: Creare OpenViduMeetError for this case
			logger.error('Webhooks preferences not found');
			return res.status(404).json({ message: 'Webhooks preferences not found' });
		}

		return res.status(200).json(preferences.webhooksPreferences);
	} catch (error) {
		if (error instanceof OpenViduMeetError) {
			logger.error(`Error getting webhooks preferences: ${error.message}`);
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		logger.error('Error getting webhooks preferences:' + error);
		return res.status(500).json({ message: 'Error fetching webhooks preferences from database' });
	}
};
