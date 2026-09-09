import type { NextFunction, Request, Response } from 'express';
import { errorUnsupportedMediaType, rejectRequestFromMeetError } from '../models/error.model.js';

export const mediaTypeValidatorMiddleware = (req: Request, res: Response, next: NextFunction) => {
	if (req.method === 'GET') {
		return next();
	}

	const supportedMediaTypes = ['application/json'];
	const contentType = req.headers['content-type'];

	if (!contentType || !supportedMediaTypes.includes(contentType)) {
		const error = errorUnsupportedMediaType(supportedMediaTypes);
		return rejectRequestFromMeetError(res, error);
	}

	next();
};
