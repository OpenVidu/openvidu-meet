import type { MeetAppearanceConfig, SecurityConfig } from '@openvidu-meet/typings';
import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { MEET_ENV } from '../environment.js';
import { handleError } from '../models/error.model.js';
import { GlobalConfigService } from '../services/global-config.service.js';
import { LoggerService } from '../services/logger.service.js';

export const updateSecurityConfig = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const configService = container.get(GlobalConfigService);

	logger.verbose('Updating security config');
	const securityConfig = req.body as SecurityConfig;

	try {
		const updatedConfig = await configService.updateSecurityConfig(securityConfig);
		return res.status(200).json(updatedConfig);
	} catch (error) {
		handleError(res, error, 'updating security config');
	}
};

export const getSecurityConfig = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const configService = container.get(GlobalConfigService);

	logger.verbose('Getting security config');

	try {
		const securityConfig = await configService.getSecurityConfig();
		return res.status(200).json(securityConfig);
	} catch (error) {
		handleError(res, error, 'getting security config');
	}
};

export const updateRoomsAppearanceConfig = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const configService = container.get(GlobalConfigService);

	logger.verbose(`Updating rooms appearance config: ${JSON.stringify(req.body)}`);
	const appearanceConfig = req.body as { appearance: MeetAppearanceConfig };

	try {
		const updatedConfig = await configService.updateRoomsAppearanceConfig(appearanceConfig);
		return res.status(200).json(updatedConfig);
	} catch (error) {
		handleError(res, error, 'updating rooms appearance config');
	}
};

export const getRoomsAppearanceConfig = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const configService = container.get(GlobalConfigService);

	logger.verbose('Getting rooms appearance config');

	try {
		const appearanceConfig = await configService.getRoomsAppearanceConfig();
		return res.status(200).json(appearanceConfig);
	} catch (error) {
		handleError(res, error, 'getting rooms appearance config');
	}
};

export const getCaptionsConfig = (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	logger.verbose('Getting captions config');

	try {
		const captionsEnabled = MEET_ENV.CAPTIONS_ENABLED === 'true';
		return res.status(200).json({ enabled: captionsEnabled });
	} catch (error) {
		handleError(res, error, 'getting captions config');
	}
};
