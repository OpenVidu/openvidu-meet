import { SecurityPreferencesDTO, UpdateSecurityPreferencesDTO } from '@typings-ce';
import { Request, Response } from 'express';
import { container } from '../../config/index.js';
import { OpenViduMeetError } from '../../models/error.model.js';
import { LoggerService, MeetStorageService } from '../../services/index.js';

export const updateSecurityPreferences = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const globalPrefService = container.get(MeetStorageService);

	logger.verbose(`Updating security preferences: ${JSON.stringify(req.body)}`);
	const securityPreferences = req.body as UpdateSecurityPreferencesDTO;

	try {
		const globalPreferences = await globalPrefService.getGlobalPreferences();

		if (securityPreferences.roomCreationPolicy) {
			globalPreferences.securityPreferences.roomCreationPolicy = securityPreferences.roomCreationPolicy;
		}

		if (securityPreferences.authentication) {
			const currentAuth = globalPreferences.securityPreferences.authentication;
			const newAuth = securityPreferences.authentication;

			currentAuth.authMode = newAuth.authMode;
			currentAuth.method.type = newAuth.method.type;
		}

		await globalPrefService.saveGlobalPreferences(globalPreferences);

		return res.status(200).json({ message: 'Security preferences updated successfully' });
	} catch (error) {
		if (error instanceof OpenViduMeetError) {
			logger.error(`Error updating security preferences: ${error.message}`);
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		logger.error('Error updating security preferences:' + error);
		return res.status(500).json({ message: 'Error updating security preferences' });
	}
};

export const getSecurityPreferences = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const preferenceService = container.get(MeetStorageService);

	try {
		const preferences = await preferenceService.getGlobalPreferences();

		if (!preferences) {
			return res.status(404).json({ message: 'Security preferences not found' });
		}

		// Convert the preferences to the DTO format by removing credentials
		const securityPreferences = preferences.securityPreferences;
		const securityPreferencesDTO: SecurityPreferencesDTO = {
			roomCreationPolicy: securityPreferences.roomCreationPolicy,
			authentication: {
				authMode: securityPreferences.authentication.authMode,
				method: {
					type: securityPreferences.authentication.method.type
				}
			}
		};
		return res.status(200).json(securityPreferencesDTO);
	} catch (error) {
		if (error instanceof OpenViduMeetError) {
			logger.error(`Error getting security preferences: ${error.message}`);
			return res.status(error.statusCode).json({ name: error.name, message: error.message });
		}

		logger.error('Error getting security preferences:' + error);
		return res.status(500).json({ message: 'Error fetching security preferences from database' });
	}
};
