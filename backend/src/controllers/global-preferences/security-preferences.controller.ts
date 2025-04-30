import { SecurityPreferencesDTO, UpdateSecurityPreferencesDTO } from '@typings-ce';
import { Request, Response } from 'express';
import { container } from '../../config/index.js';
import { handleError } from '../../models/error.model.js';
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
		handleError(res, error, 'updating security preferences');
	}
};

export const getSecurityPreferences = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const preferenceService = container.get(MeetStorageService);

	logger.verbose('Getting security preferences');

	try {
		const preferences = await preferenceService.getGlobalPreferences();

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
		handleError(res, error, 'getting security preferences');
	}
};
