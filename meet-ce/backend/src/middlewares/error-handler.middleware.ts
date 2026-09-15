import type { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import {
	errorMalformedBody,
	errorPayloadTooLarge,
	internalError,
	OpenViduMeetError,
	rejectRequestFromMeetError
} from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';

/**
 * body-parser rejects a body it cannot read with an error that names the reason in `type` and,
 * for an oversized body, carries the limit it applied.
 */
const fromBodyParser = (err: unknown): OpenViduMeetError | undefined => {
	if (!(err instanceof Error) || !('type' in err)) {
		return undefined;
	}

	switch (err.type) {
		case 'entity.too.large':
			return errorPayloadTooLarge(Number('limit' in err ? err.limit : 0));
		case 'entity.parse.failed':
			return errorMalformedBody();
		default:
			return undefined;
	}
};

/**
 * Global catch-all error middleware. Registered last, after every route.
 *
 * Express 5 automatically forwards both synchronous throws and rejected promises from
 * route handlers and middleware here, so this is the single safety net for any error that
 * did not go through a controller's handleError(). Without it, such errors fall through to
 * Express's default handler and never reach Winston, leaving 500s untraceable.
 *
 * It preserves the existing error contract: an OpenViduMeetError keeps its own status code,
 * a body the parser refused gets the 4xx it already deserved, anything else is logged with
 * its stack and masked as a generic 500.
 */
export const globalErrorHandler = (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
	const logger = container.get(LoggerService);

	// If the response has already started, delegate to Express's default handler to close it.
	if (res.headersSent) {
		return next(err);
	}

	const meetError = err instanceof OpenViduMeetError ? err : fromBodyParser(err);

	if (!meetError) {
		logger.error('Unhandled error reached the global error handler', err);
		rejectRequestFromMeetError(res, internalError('processing the request'));
		return;
	}

	if (meetError.statusCode >= 500) {
		logger.error('Unhandled server error reached the global error handler', err);
	} else {
		// Expected client-side rejection that slipped past a controller: keep it out of the error stream.
		logger.debug(`Unhandled client error reached the global error handler: ${meetError.message}`);
	}

	rejectRequestFromMeetError(res, meetError);
};
