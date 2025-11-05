import { WebhookConfig } from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import { container } from '../../config/index.js';
import { handleError } from '../../models/error.model.js';
import { GlobalConfigService, LoggerService, OpenViduWebhookService } from '../../services/index.js';

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
