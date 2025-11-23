import { MeetAppearanceConfig, SecurityConfig, WebhookConfig } from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
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
		const globalConfig = await configService.getGlobalConfig();

		globalConfig.webhooksConfig = {
			enabled: webhookConfig.enabled,
			url: webhookConfig.url === undefined ? globalConfig.webhooksConfig.url : webhookConfig.url
		};

		await configService.saveGlobalConfig(globalConfig);
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
		const config = await configService.getGlobalConfig();
		return res.status(200).json(config.webhooksConfig);
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
		const globalConfig = await configService.getGlobalConfig();
		globalConfig.securityConfig.authentication = { ...securityConfig.authentication };
		await configService.saveGlobalConfig(globalConfig);

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
		const config = await configService.getGlobalConfig();
		const securityConfig = config.securityConfig;
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
		const globalConfig = await configService.getGlobalConfig();

		if (globalConfig.roomsConfig.appearance.themes.length > 0) {
			// Preserve existing theme colors if they are not provided in the update
			const existingTheme = globalConfig.roomsConfig.appearance.themes[0];
			const newTheme = appearanceConfig.appearance.themes[0];

			newTheme.backgroundColor = newTheme.backgroundColor ?? existingTheme.backgroundColor;
			newTheme.primaryColor = newTheme.primaryColor ?? existingTheme.primaryColor;
			newTheme.secondaryColor = newTheme.secondaryColor ?? existingTheme.secondaryColor;
			newTheme.accentColor = newTheme.accentColor ?? existingTheme.accentColor;
			newTheme.surfaceColor = newTheme.surfaceColor ?? existingTheme.surfaceColor;
		}

		globalConfig.roomsConfig = appearanceConfig;
		await configService.saveGlobalConfig(globalConfig);

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
		const globalConfig = await configService.getGlobalConfig();
		const appearanceConfig = globalConfig.roomsConfig.appearance;
		return res.status(200).json({ appearance: appearanceConfig });
	} catch (error) {
		handleError(res, error, 'getting rooms appearance config');
	}
};
