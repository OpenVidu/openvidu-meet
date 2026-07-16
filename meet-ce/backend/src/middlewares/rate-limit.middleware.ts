import type { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import ms from 'ms';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { LoggerService } from '../services/logger.service.js';

/**
 * Builds the JSON body returned on a 429 response so that rate-limited requests share the same
 * `{ error, message }` shape as every other API error (see OpenViduMeetError). express-rate-limit
 * sends a string `message` as plain text, which would break clients that always parse JSON, so we
 * always hand it a structured object instead.
 */
const tooManyRequestsMessage = (message: string) => ({ error: 'Too Many Requests', message });

/**
 * Wraps an express-rate-limit instance so that rate limiting is bypassed in the test environment.
 * This keeps integration tests fast and deterministic while still protecting production endpoints
 * from denial-of-service via request flooding.
 */
const withTestBypass = (options: Partial<Options>): RequestHandler => {
	const limiter = rateLimit({
		// Use standard draft-7 headers for better proxy compatibility
		standardHeaders: 'draft-7',
		// Disable legacy headers
		legacyHeaders: false,
		// Disable check for trust proxy setting set to true
		validate: { trustProxy: false },
		// Log throttled requests so operators can see abuse / DoS pressure. Only fires when a
		// client exceeds the limit; still returns the standard structured 429 body. Log the path
		// without its query string: room/recording routes carry secrets in the query
		// (?secret=, ?recordingSecret=) that must not leak into logs.
		handler: (req: Request, res: Response, _next: NextFunction, opts: Options) => {
			const pathWithoutQuery = req.originalUrl.split('?')[0];
			container
				.get(LoggerService)
				.warn(`Rate limit exceeded for ${req.method} ${pathWithoutQuery} from IP ${req.ip}`);
			res.status(opts.statusCode).json(opts.message);
		},
		...options
	});

	return (req: Request, res: Response, next: NextFunction) => {
		// Bypass rate limiting in development, test or CI environment
		const { NODE_ENV } = process.env;
		const skipRateLimit = NODE_ENV === 'development' || NODE_ENV === 'test' || NODE_ENV === 'ci';

		if (skipRateLimit) return next();

		return limiter(req, res, next);
	};
};

/**
 * Skips IP-based rate limiting for trusted server-to-server requests authenticated via API key.
 *
 * In CE there is a single API key per deployment (see ApiKeyService), shared by an integrator's
 * backend and originating from a single server IP. IP-based limiting would therefore collapse the
 * integrator's entire backend into one bucket and throttle their busiest (most legitimate) traffic.
 * Abuse of the API key itself is an authentication/quota concern, not a rate-limiting one, so we let
 * these requests through and keep IP-based limiting for browser/end-user traffic on the same routes.
 */
const skipApiKeyRequests = (req: Request): boolean => Boolean(req.headers[INTERNAL_CONFIG.API_KEY_HEADER]);

/**
 * Rate limiter for login attempts. Limits only failed attempts to prevent account lockout.
 * This strikes a balance between security and usability by allowing legitimate users to log in
 * without undue friction while still protecting against brute-force password guessing.
 */
export const loginLimiter: RequestHandler = withTestBypass({
	windowMs: ms('5m'),
	limit: 5,
	skipSuccessfulRequests: true,
	message: tooManyRequestsMessage('Too many login attempts, please try again later')
});

/**
 * Strict rate limiter for sensitive, low-frequency mutating actions performed from the admin/user
 * console (password changes/resets, user and API-key management, webhook tests). These are guarded by
 * a session token, so the threat is a scripted or hijacked session rather than anonymous flooding;
 * the tight ceiling limits brute-force and abuse while staying well above normal interactive use.
 */
export const sensitiveActionLimiter: RequestHandler = withTestBypass({
	windowMs: ms('5m'),
	limit: 20,
	message: tooManyRequestsMessage('Too many requests for this operation, please try again later')
});

/**
 * Rate limiter for sensitive authentication endpoints (refresh, logout).
 * Prevents brute-force enumeration and token-grinding attacks.
 */
export const authLimiter: RequestHandler = withTestBypass({
	windowMs: ms('1m'),
	limit: 30,
	message: tooManyRequestsMessage('Too many authentication requests, please try again later')
});

/**
 * Rate limiter for token-generation endpoints (e.g. room member tokens).
 * These endpoints touch persistent storage and sign cryptographic material, so they
 * are protected against floods that could exhaust resources. The ceiling is kept generous
 * because a large audience joining a single meeting from behind one shared public IP
 * (corporate NAT, campus, event Wi-Fi) all issue their token through the same IP bucket.
 */
export const tokenIssuanceLimiter: RequestHandler = withTestBypass({
	windowMs: ms('1m'),
	limit: 200,
	message: tooManyRequestsMessage('Too many token requests, please try again later')
});

/**
 * General-purpose rate limiter for authenticated API routes that perform expensive
 * authorization (DB lookups, signed-URL generation, file system access).
 *
 * Skips server-to-server requests authenticated via API key (see skipApiKeyRequests), so it is safe
 * to apply to the public /api/v1 routes that are multiplexed between integrator backends and browsers.
 *
 * The ceiling is kept generous because the meeting join flow (room lookup, access, room-appearance
 * and captions config) fires several of these calls per participant, and a large audience joining
 * from behind one shared public IP would otherwise collapse into a single bucket and be throttled.
 */
export const apiLimiter: RequestHandler = withTestBypass({
	windowMs: ms('1m'),
	limit: 500,
	skip: skipApiKeyRequests,
	message: tooManyRequestsMessage('Too many requests, please try again later')
});

/**
 * Rate limiter for static asset routes that hit the file system on every request.
 * Browsers cache these aggressively, so a higher ceiling is appropriate. The ceiling also
 * accommodates a large audience loading the app for the first time (uncached) from behind one
 * shared public IP.
 */
export const staticAssetLimiter: RequestHandler = withTestBypass({
	windowMs: ms('1m'),
	limit: 1000,
	message: tooManyRequestsMessage('Too many requests, please try again later')
});
