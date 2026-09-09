import { beforeAll, describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { registerDependencies } from '../../../src/config/dependency-injector.config.js';
import { globalErrorHandler } from '../../../src/middlewares/error-handler.middleware.js';

/**
 * Mirrors the wiring in server.ts: the body parser runs before the routes and the global error
 * handler is registered last, so every error a parser raises ends up there.
 */
const buildApp = () => {
	const app = express();
	app.use(express.json({ limit: '1kb' }));
	app.post('/echo', (req, res) => res.status(200).json(req.body));
	app.post('/broken', () => {
		throw new Error('connection reset by peer');
	});
	app.use(globalErrorHandler);
	return app;
};

describe('globalErrorHandler', () => {
	beforeAll(() => {
		registerDependencies();
	});

	it('answers 413 Payload Too Large to a body the parser refused for its size', async () => {
		const response = await request(buildApp())
			.post('/echo')
			.set('Content-Type', 'application/json')
			.send(JSON.stringify({ padding: 'x'.repeat(2048) }));

		expect(response.status).toBe(413);
		expect(response.body).toEqual({
			error: 'Payload Too Large',
			message: 'Request body exceeds the limit of 1024 bytes'
		});
	});

	it('answers 400 Bad Request to a body the parser could not read as JSON', async () => {
		const response = await request(buildApp())
			.post('/echo')
			.set('Content-Type', 'application/json')
			.send('{"padding": ');

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ error: 'Bad Request', message: 'Malformed body' });
	});

	it('masks any other error as a 500 without leaking its message', async () => {
		const response = await request(buildApp()).post('/broken').send({});

		expect(response.status).toBe(500);
		expect(response.body).toEqual({
			error: 'Internal Server Error',
			message: 'Unexpected error while processing the request'
		});
	});
});
