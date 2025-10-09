import { SecurityConfig } from '@typings-ce';
import { Request, Response } from 'express';
import { container } from '../../config/index.js';
import { handleError } from '../../models/error.model.js';
import { LoggerService, MeetStorageService } from '../../services/index.js';

export const updateSecurityConfig = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const storageService = container.get(MeetStorageService);

	logger.verbose(`Updating security config: ${JSON.stringify(req.body)}`);
	const securityConfig = req.body as SecurityConfig;

	try {
		const globalConfig = await storageService.getGlobalConfig();
		globalConfig.securityConfig.authentication = { ...securityConfig.authentication };
		await storageService.saveGlobalConfig(globalConfig);

		return res.status(200).json({ message: 'Security config updated successfully' });
	} catch (error) {
		handleError(res, error, 'updating security config');
	}
};

export const getSecurityConfig = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const storageService = container.get(MeetStorageService);

	logger.verbose('Getting security config');

	try {
		const config = await storageService.getGlobalConfig();
		const securityConfig = config.securityConfig;
		return res.status(200).json(securityConfig);
	} catch (error) {
		handleError(res, error, 'getting security config');
	}
};
