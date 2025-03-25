import { container } from '../config/dependency-injector.config.js';
import { NextFunction, Request, Response } from 'express';
import { LoggerService } from '../services/logger.service.js';
import { GlobalPreferencesService } from '../services/index.js';
import { allowAnonymous, apiKeyValidator, tokenAndRoleValidator, withAuth } from './auth.middleware.js';
import { UserRole } from '@typings-ce';

export const configureRoomAuth = async (req: Request, res: Response, next: NextFunction) => {
	const logger = container.get(LoggerService);
	const globalPrefService = container.get(GlobalPreferencesService);
	let allowRoomCreation: boolean;
	let requireAuthentication: boolean;

	try {
		const { securityPreferences } = await globalPrefService.getGlobalPreferences();
		({ allowRoomCreation, requireAuthentication } = securityPreferences.roomCreationPolicy);
	} catch (error) {
		logger.error('Error checking room creation policy:' + error);
		return res.status(500).json({ message: 'Internal server error' });
	}

	const authValidators = [apiKeyValidator, tokenAndRoleValidator(UserRole.ADMIN)];

	if (allowRoomCreation) {
		if (requireAuthentication) {
			authValidators.push(tokenAndRoleValidator(UserRole.USER));
		} else {
			authValidators.push(allowAnonymous);
		}
	}

	return withAuth(...authValidators)(req, res, next);
};
