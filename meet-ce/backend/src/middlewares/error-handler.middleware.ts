import type { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { internalError, OpenViduMeetError, rejectRequestFromMeetError } from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';

/**
 * Global catch-all error middleware. Registered last, after every route.
 *
 * Express 5 automatically forwards both synchronous throws and rejected promises from
 * route handlers and middleware here, so this is the single safety net for any error that
 * did not go through a controller's handleError(). Without it, such errors fall through to
 * Express's default handler and never reach Winston, leaving 500s untraceable.
 *
 * It preserves the existing error contract: an OpenViduMeetError keeps its own status code,
 * anything else is logged with its stack and masked as a generic 500.
 */
export const globalErrorHandler = (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
	const logger = container.get(LoggerService);

	// If the response has already started, delegate to Express's default handler to close it.
	if (res.headersSent) {
		return next(err);
	}

	if (err instanceof OpenViduMeetError) {
		if (err.statusCode >= 500) {
			logger.error('Unhandled server error reached the global error handler', err);
		} else {
			// Expected client-side rejection that slipped past a controller: keep it out of the error stream.
			logger.debug(`Unhandled client error reached the global error handler: ${err.message}`);
		}

		rejectRequestFromMeetError(res, err);
		return;
	}

	logger.error('Unhandled error reached the global error handler', err);
	rejectRequestFromMeetError(res, internalError('processing the request'));
};
