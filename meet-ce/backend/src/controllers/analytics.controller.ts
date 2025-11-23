import { Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { handleError } from '../models/error.model.js';
import { AnalyticsService } from '../services/analytics.service.js';
import { LoggerService } from '../services/logger.service.js';

export const getAnalytics = async (req: Request, res: Response): Promise<void> => {
	const logger = container.get(LoggerService);
	logger.verbose('Analytics request received');

	try {
		const analyticsService = container.get(AnalyticsService);
		const analytics = await analyticsService.getAnalytics();
		res.status(200).json(analytics);
	} catch (error) {
		handleError(res, error, 'getting analytics');
	}
};
