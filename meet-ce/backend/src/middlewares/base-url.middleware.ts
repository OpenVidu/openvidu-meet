import type { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { RequestSessionService } from '../services/request-session.service.js';

export const setBaseUrlFromRequest = (req: Request, _res: Response, next: NextFunction) => {
	// LiveKit addresses its webhooks to the internal service host, which is no base for the URLs handed to users
	if (req.path !== '/livekit/webhook') {
		container.get(RequestSessionService).setRequestOrigin(`${req.protocol}://${req.get('host')}`);
	}

	next();
};
