import { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { HttpContextService } from '../services/index.js';

export const httpContextMiddleware = (req: Request, _res: Response, next: NextFunction) => {
	if (req.path === '/livekit/webhook') {
		// Skip setting context for LiveKit webhooks
		return next();
	}

	const httpContextService = container.get(HttpContextService);
	httpContextService.setContext(req);
	next();
};
