import type { MeetWebhookOptions } from '@openvidu-meet/typings';
import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { handleError } from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';
import { WebhookService } from '../services/webhook.service.js';

export const createWebhook = async (req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Create webhook request received');

	const webhookService = container.get(WebhookService);
	const options = req.body as MeetWebhookOptions;

	try {
		const webhook = await webhookService.createWebhook(options);
		return res.status(201).json(webhook);
	} catch (error) {
		handleError(res, error, 'creating webhook');
	}
};

export const getWebhooks = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Get webhooks request received');

	const webhookService = container.get(WebhookService);

	try {
		const webhooks = await webhookService.getWebhooks();
		return res.status(200).json({ webhooks });
	} catch (error) {
		handleError(res, error, 'getting webhooks');
	}
};

export const getWebhook = async (req: Request, res: Response) => {
	const { webhookId } = req.params as Record<string, string>;
	const logger = container.get(LoggerService);
	logger.verbose(`Get webhook request received for webhook '${webhookId}'`);

	const webhookService = container.get(WebhookService);

	try {
		const webhook = await webhookService.getWebhook(webhookId);
		return res.status(200).json(webhook);
	} catch (error) {
		handleError(res, error, `getting webhook '${webhookId}'`);
	}
};

export const updateWebhook = async (req: Request, res: Response) => {
	const { webhookId } = req.params as Record<string, string>;
	const logger = container.get(LoggerService);
	logger.verbose(`Update webhook request received for webhook '${webhookId}'`);

	const webhookService = container.get(WebhookService);
	const options = req.body as MeetWebhookOptions;

	try {
		const webhook = await webhookService.updateWebhook(webhookId, options);
		return res.status(200).json(webhook);
	} catch (error) {
		handleError(res, error, `updating webhook '${webhookId}'`);
	}
};

export const deleteWebhook = async (req: Request, res: Response) => {
	const { webhookId } = req.params as Record<string, string>;
	const logger = container.get(LoggerService);
	logger.verbose(`Delete webhook request received for webhook '${webhookId}'`);

	const webhookService = container.get(WebhookService);

	try {
		await webhookService.deleteWebhook(webhookId);
		return res.status(200).json({ message: `Webhook '${webhookId}' deleted successfully` });
	} catch (error) {
		handleError(res, error, `deleting webhook '${webhookId}'`);
	}
};

export const sendWebhookTestEvent = async (req: Request, res: Response) => {
	const { webhookId } = req.params as Record<string, string>;
	const logger = container.get(LoggerService);
	logger.verbose(`Test webhook request received for webhook '${webhookId}'`);

	const webhookService = container.get(WebhookService);

	try {
		await webhookService.testWebhook(webhookId);
		return res.status(200).json({ message: `Test event sent to webhook '${webhookId}'` });
	} catch (error) {
		handleError(res, error, `testing webhook '${webhookId}'`);
	}
};
