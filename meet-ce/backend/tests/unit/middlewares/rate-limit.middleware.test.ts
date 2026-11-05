import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { container, registerDependencies } from '../../../src/config/dependency-injector.config.js';
import {
	apiLimiter,
	authLimiter,
	loginLimiter,
	sensitiveActionLimiter,
	staticAssetLimiter,
	tokenIssuanceLimiter
} from '../../../src/middlewares/rate-limit.middleware.js';
import { LoggerService } from '../../../src/services/logger.service.js';

/** The limiters are bypassed under NODE_ENV=test, so these run them as a production server does. */
describe('rate limiting', () => {
	const originalNodeEnv = process.env.NODE_ENV;

	beforeAll(() => {
		registerDependencies();
		process.env.NODE_ENV = 'production';
	});

	afterAll(() => {
		process.env.NODE_ENV = originalNodeEnv;
	});

	// The limiters keep one count per client IP for the whole module, so each case is its own client.
	let client = 0;
	const appWith = (limiter: RequestHandler, status = 200) => {
		const ip = `203.0.113.${++client}`;
		const app = express();
		app.set('trust proxy', true);
		app.use((req, _res, next) => {
			req.headers['x-forwarded-for'] = ip;
			next();
		});
		app.post('/limited', limiter, (_req, res) => res.status(status).json({ ok: true }));
		return app;
	};

	it('answers 429 with a JSON error once a client fails to log in five times, and logs the path without its query', async () => {
		const warn = jest.spyOn(container.get(LoggerService), 'warn').mockImplementation(() => {});
		const app = appWith(loginLimiter, 401);

		for (let attempt = 0; attempt < 5; attempt++) {
			expect((await request(app).post('/limited?secret=s3cr3t')).status).toBe(401);
		}

		const response = await request(app).post('/limited?secret=s3cr3t');

		expect(response.status).toBe(429);
		expect(response.body).toEqual({
			error: 'Too Many Requests',
			message: 'Too many login attempts, please try again later'
		});
		expect(response.headers['ratelimit-policy']).toBe('5;w=300');
		expect(warn).toHaveBeenCalledWith(
			expect.stringMatching(/^Rate limit exceeded for POST \/limited from IP 203\.0\.113\.\d+$/)
		);
		expect(warn.mock.calls.flat().join(' ')).not.toContain('s3cr3t');
		warn.mockRestore();
	});

	it('does not count a successful login against the client', async () => {
		const app = appWith(loginLimiter);

		for (let attempt = 0; attempt < 10; attempt++) {
			expect((await request(app).post('/limited')).status).toBe(200);
		}
	});

	it('never limits a request authenticated with an API key, and limits the rest by IP', async () => {
		const warn = jest.spyOn(container.get(LoggerService), 'warn').mockImplementation(() => {});
		const app = appWith(apiLimiter);

		const withKey = await Promise.all(
			Array.from({ length: 510 }, () => request(app).post('/limited').set('x-api-key', 'key'))
		);
		expect(withKey.every((response) => response.status === 200)).toBe(true);

		const withoutKey = await Promise.all(Array.from({ length: 510 }, () => request(app).post('/limited')));
		expect(withoutKey.filter((response) => response.status === 429)).toHaveLength(10);
		warn.mockRestore();
	});

	it.each(['development', 'test', 'ci'])('lets every request through when NODE_ENV is %s', async (nodeEnv) => {
		process.env.NODE_ENV = nodeEnv;
		const app = appWith(loginLimiter, 401);

		const responses = await Promise.all(Array.from({ length: 10 }, () => request(app).post('/limited')));

		expect(responses.every((response) => response.status === 401)).toBe(true);
		expect(responses[0].headers['ratelimit-policy']).toBeUndefined();
		process.env.NODE_ENV = 'production';
	});

	it.each([
		['login attempts', loginLimiter, '5;w=300'],
		['sensitive actions', sensitiveActionLimiter, '20;w=300'],
		['authentication', authLimiter, '30;w=60'],
		['token issuance', tokenIssuanceLimiter, '200;w=60'],
		['the API', apiLimiter, '500;w=60'],
		['static assets', staticAssetLimiter, '1000;w=60']
	])('limits %s to the policy %s, announced only in the standard headers', async (_name, limiter, policy) => {
		const response = await request(appWith(limiter)).post('/limited');

		expect(response.headers['ratelimit-policy']).toBe(policy);
		expect(response.headers['x-ratelimit-limit']).toBeUndefined();
	});
});
