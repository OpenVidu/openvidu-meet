import { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { HttpContextService } from '../services/index.js';

export const httpContextMiddleware = (req: Request, res: Response, next: NextFunction) => {
	const httpContextService = container.get(HttpContextService);
	httpContextService.setContext(req);

	// Clear context after response is finished
	res.on('finish', () => {
		httpContextService.clearContext();
	});

	next();
};
