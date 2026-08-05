import type { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { handleError } from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';
import { getSystemInfo } from '../utils/system-info.utils.js';

export const getInfo = (_req: Request, res: Response) => {
	const logger = container.get(LoggerService);

	logger.verbose('Getting system info');

	try {
		return res.status(200).json(getSystemInfo());
	} catch (error) {
		handleError(res, error, 'getting system info');
	}
};
