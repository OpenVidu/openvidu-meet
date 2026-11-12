import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import { container } from '../config/dependency-injector.config.js';
import { configureZodErrorMessages } from '../config/zod-config.js';
import {
	errorMalformedBody,
	errorMalformedPath,
	errorPayloadTooLarge,
	internalError,
	OpenViduMeetError,
	type OpenViduMeetErrorFields,
	toMeetError
} from '../models/error.model.js';
import { LoggerService } from '../services/logger.service.js';

// Applied here because this module renders zod errors into 422 responses (`rejectUnprocessableRequest`) and is
// imported by every request validator, so the error map is installed at boot in both editions before any request
// is parsed.
configureZodErrorMessages();

interface ErrorResponse extends OpenViduMeetErrorFields {
	error: string;
	message: string;
	details?: {
		field: string;
		message: string;
	}[];
}

export const handleError = (res: Response, error: unknown, operationDescription: string) => {
	const logger = container.get(LoggerService);
	const meetError = toMeetError(error, operationDescription);

	if (meetError.statusCode >= 500) {
		logger.error(`Error while ${operationDescription}`, error);
	} else {
		logger.debug(`Request rejected while ${operationDescription}: ${meetError.message}`);
	}

	return rejectRequestFromMeetError(res, meetError);
};

export const rejectRequestFromMeetError = (res: Response, error: OpenViduMeetError) => {
	const errorResponse: ErrorResponse = {
		error: error.name,
		message: error.message,
		...error.fields
	};
	return res.status(error.statusCode).json(errorResponse);
};

export const rejectUnprocessableRequest = (res: Response, error: z.ZodError) => {
	const errorDetails = error.issues.map((error) => ({
		field: error.path.join('.'),
		message: error.message
	}));

	const errorResponse: ErrorResponse = {
		error: 'Unprocessable Entity',
		message: 'Invalid request',
		details: errorDetails
	};
	return res.status(422).json(errorResponse);
};

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

/** The router rejects a path parameter it cannot percent-decode with a `URIError`. */
const fromRouter = (err: unknown): OpenViduMeetError | undefined =>
	err instanceof URIError ? errorMalformedPath() : undefined;

/**
 * Global catch-all error middleware. Registered last, after every route.
 *
 * Express 5 automatically forwards both synchronous throws and rejected promises from
 * route handlers and middleware here, so this is the single safety net for any error that
 * did not go through a controller's handleError(). Without it, such errors fall through to
 * Express's default handler and never reach Winston, leaving 500s untraceable.
 *
 * It preserves the existing error contract: an OpenViduMeetError keeps its own status code,
 * a body the parser refused and a path the router could not decode get the 4xx they already
 * deserved, anything else is logged with its stack and masked as a generic 500.
 */
export const globalErrorHandler = (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
	const logger = container.get(LoggerService);

	// If the response has already started, delegate to Express's default handler to close it.
	if (res.headersSent) {
		return next(err);
	}

	const meetError = err instanceof OpenViduMeetError ? err : (fromBodyParser(err) ?? fromRouter(err));

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
