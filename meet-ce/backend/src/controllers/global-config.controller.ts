import { MeetAppearanceConfig, SecurityConfig, WebhookConfig } from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { MEET_ENV } from '../environment.js';
import { handleError } from '../models/error.model.js';
import { GlobalConfigService } from '../services/global-config.service.js';
import { LoggerService } from '../services/logger.service.js';
import { OpenViduWebhookService } from '../services/openvidu-webhook.service.js';

export const updateWebhookConfig = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const configService = container.get(GlobalConfigService);

	logger.info(`Updating webhooks config: ${JSON.stringify(req.body)}`);
	const webhookConfig = req.body as WebhookConfig;

	try {
		await configService.updateWebhookConfig(webhookConfig);
		return res.status(200).json({ message: 'Webhooks config updated successfully' });
	} catch (error) {
		handleError(res, error, 'updating webhooks config');
	}
};

export const getWebhookConfig = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const configService = container.get(GlobalConfigService);

	logger.verbose('Getting webhooks config');

	try {
		const webhookConfig = await configService.getWebhookConfig();
		return res.status(200).json(webhookConfig);
	} catch (error) {
		handleError(res, error, 'getting webhooks config');
	}
};

export const testWebhook = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const webhookService = container.get(OpenViduWebhookService);

	logger.verbose(`Testing webhook URL: ${req.body.url}`);
	const url = req.body.url;

	try {
		await webhookService.testWebhookUrl(url);
		logger.info(`Webhook URL '${url}' is valid`);
		return res.status(200).json({ message: 'Webhook URL is valid' });
	} catch (error) {
		handleError(res, error, 'testing webhook URL');
	}
};

export const updateSecurityConfig = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const configService = container.get(GlobalConfigService);

	logger.verbose(`Updating security config: ${JSON.stringify(req.body)}`);
	const securityConfig = req.body as SecurityConfig;

	try {
		await configService.updateSecurityConfig(securityConfig);
		return res.status(200).json({ message: 'Security config updated successfully' });
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
		await configService.updateRoomsAppearanceConfig(appearanceConfig);
		return res.status(200).json({ message: 'Rooms appearance config updated successfully' });
	} catch (error) {
		handleError(res, error, 'updating rooms appearance config');
	}
};

export const getRoomsAppearanceConfig = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	const configService = container.get(GlobalConfigService);

	logger.verbose(`Getting rooms appearance config`);

	try {
		const appearanceConfig = await configService.getRoomsAppearanceConfig();
		return res.status(200).json(appearanceConfig);
	} catch (error) {
		handleError(res, error, 'getting rooms appearance config');
	}
};

export const getCaptionsConfig = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	logger.verbose('Getting captions config');

	try {
		const captionsEnabled = MEET_ENV.CAPTIONS_ENABLED === 'true';
		return res.status(200).json({ enabled: captionsEnabled });
	} catch (error) {
		handleError(res, error, 'getting captions config');
	}
};
