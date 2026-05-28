import type { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import ms from 'ms';

/**
 * Wraps an express-rate-limit instance so that rate limiting is bypassed in the test environment.
 * This keeps integration tests fast and deterministic while still protecting production endpoints
 * from denial-of-service via request flooding.
 */
const withTestBypass = (options: Partial<Options>): RequestHandler => {
	const limiter = rateLimit({
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		...options
	});

	return (req: Request, res: Response, next: NextFunction) => {
		if (process.env.NODE_ENV === 'test') {
			return next();
		}

		return limiter(req, res, next);
	};
};

/**
 * Rate limiter for sensitive authentication endpoints (refresh, logout).
 * Prevents brute-force enumeration and token-grinding attacks.
 */
export const authLimiter: RequestHandler = withTestBypass({
	windowMs: ms('1m'),
	limit: 30,
	message: 'Too many authentication requests, please try again later'
});

/**
 * Rate limiter for token-generation endpoints (e.g. room member tokens).
 * These endpoints touch persistent storage and sign cryptographic material, so they
 * are protected against floods that could exhaust resources.
 */
export const tokenIssuanceLimiter: RequestHandler = withTestBypass({
	windowMs: ms('1m'),
	limit: 60,
	message: 'Too many token requests, please try again later'
});

/**
 * General-purpose rate limiter for authenticated API routes that perform expensive
 * authorization (DB lookups, signed-URL generation, file system access).
 */
export const apiLimiter: RequestHandler = withTestBypass({
	windowMs: ms('1m'),
	limit: 120,
	message: 'Too many requests, please try again later'
});

/**
 * Rate limiter for static asset routes that hit the file system on every request.
 * Browsers cache these aggressively, so a higher ceiling is appropriate.
 */
export const staticAssetLimiter: RequestHandler = withTestBypass({
	windowMs: ms('1m'),
	limit: 300,
	message: 'Too many requests, please try again later'
});
