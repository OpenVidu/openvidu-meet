import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { handleError } from '../models/error.model.js';
import { ApiKeyService } from '../services/api-key.service.js';
import { LoggerService } from '../services/logger.service.js';

export const createApiKey = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Create API key request received');

	const apiKeyService = container.get(ApiKeyService);

	try {
		const apiKey = await apiKeyService.createApiKey();
		return res.status(201).json(apiKey);
	} catch (error) {
		handleError(res, error, 'creating API key');
	}
};

export const getApiKeys = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Get API keys request received');

	const apiKeyService = container.get(ApiKeyService);

	try {
		const apiKeys = await apiKeyService.getApiKeys();
		return res.status(200).json(apiKeys);
	} catch (error) {
		handleError(res, error, 'getting API keys');
	}
};

export const deleteApiKeys = async (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);
	logger.verbose('Delete API keys request received');

	const apiKeyService = container.get(ApiKeyService);

	try {
		await apiKeyService.deleteApiKeys();
		return res.status(200).json({ message: 'API keys deleted successfully' });
	} catch (error) {
		handleError(res, error, 'deleting API keys');
	}
};
