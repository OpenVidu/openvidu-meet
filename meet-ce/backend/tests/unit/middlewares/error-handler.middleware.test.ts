import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { container, registerDependencies } from '../../../src/config/dependency-injector.config.js';
import { globalErrorHandler, handleError } from '../../../src/middlewares/error-handler.middleware.js';
import { DocumentNotFoundError } from '../../../src/models/database.model.js';
import {
	errorLivekitNotAvailable,
	errorRecordingNotFound,
	OpenViduMeetError
} from '../../../src/models/error.model.js';
import { LoggerService } from '../../../src/services/logger.service.js';

/**
 * Mirrors the wiring in server.ts: the body parser runs before the routes and the global error
 * handler is registered last, so every error a parser raises ends up there.
 */
const buildApp = () => {
	const app = express();
	app.use(express.json({ limit: '1kb' }));
	app.post('/echo', (req, res) => res.status(200).json(req.body));
	app.get('/items/:itemId', (req, res) => res.status(200).json(req.params));
	app.post('/broken', () => {
		throw new Error('connection reset by peer');
	});
	app.post('/not-found', () => {
		throw errorRecordingNotFound('rec-1');
	});
	app.post('/unavailable', () => {
		throw errorLivekitNotAvailable();
	});
	app.post('/typed-object', () => {
		throw { type: 'entity.parse.failed' };
	});
	app.use(globalErrorHandler);
	return app;
};

beforeAll(() => {
	registerDependencies();
});

describe('globalErrorHandler', () => {
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

	it.each(['%E0%A4%A', '%ZZ', '%'])(
		'answers 400 Bad Request to a path parameter that does not percent-decode (%s), without an error log',
		async (itemId) => {
			const error = jest.spyOn(container.get(LoggerService), 'error');

			const response = await request(buildApp()).get(`/items/${itemId}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Bad Request', message: 'Malformed path' });
			expect(error).not.toHaveBeenCalled();
			error.mockRestore();
		}
	);

	it('decodes a well-formed percent escape in a path parameter', async () => {
		const response = await request(buildApp()).get('/items/a%20b');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ itemId: 'a b' });
	});

	it('leaves an error raised after the response started to Express, instead of writing a second one', () => {
		const next = jest.fn() as NextFunction;
		const res = { headersSent: true, status: jest.fn() } as unknown as Response;
		const failure = new Error('connection reset while streaming a recording');

		globalErrorHandler(failure, {} as Request, res, next);

		expect(next).toHaveBeenCalledWith(failure);
		expect(res.status).not.toHaveBeenCalled();
	});

	it('masks any other error as a 500 without leaking its message', async () => {
		const response = await request(buildApp()).post('/broken').send({});

		expect(response.status).toBe(500);
		expect(response.body).toEqual({
			error: 'Internal Server Error',
			message: 'Unexpected error while processing the request'
		});
	});

	it('keeps the status of a client-side OpenViduMeetError and logs it below the error stream', async () => {
		const logger = container.get(LoggerService);
		const error = jest.spyOn(logger, 'error');
		const debug = jest.spyOn(logger, 'debug');

		const response = await request(buildApp()).post('/not-found').send({});

		expect(response.status).toBe(404);
		expect(response.body).toEqual({
			error: 'Recording Error',
			message: "Recording 'rec-1' not found"
		});
		expect(error).not.toHaveBeenCalled();
		expect(debug).toHaveBeenCalledWith(expect.stringContaining("Recording 'rec-1' not found"));
		error.mockRestore();
		debug.mockRestore();
	});

	it('keeps the status of a server-side OpenViduMeetError and logs it as an error', async () => {
		const logger = container.get(LoggerService);
		const error = jest.spyOn(logger, 'error');

		const response = await request(buildApp()).post('/unavailable').send({});

		expect(response.status).toBe(503);
		expect(error).toHaveBeenCalledWith(
			'Unhandled server error reached the global error handler',
			expect.objectContaining({ statusCode: 503 })
		);
		error.mockRestore();
	});

	it('does not read a parser reason out of a thrown value that is not an Error', async () => {
		const response = await request(buildApp()).post('/typed-object').send({});

		expect(response.status).toBe(500);
	});
});

const buildResponse = () => {
	const sent: { status?: number; body?: unknown } = {};
	const res = {
		status(code: number) {
			sent.status = code;
			return this;
		},
		json(body: unknown) {
			sent.body = body;
			return this;
		}
	} as unknown as Response;

	return { res, sent };
};

describe('handleError', () => {
	it('answers 404 when the resource vanished between the existence check and the write', () => {
		const { res, sent } = buildResponse();

		handleError(res, new DocumentNotFoundError('Document not found for deletion'), 'deleting room');

		expect(sent.status).toBe(404);
		expect(sent.body).toEqual({ error: 'Not Found', message: 'The requested resource no longer exists' });
	});

	it('keeps the status and wording of a domain error', () => {
		const { res, sent } = buildResponse();

		handleError(res, new OpenViduMeetError('Room Error', "Room 'r' is closed", 409), 'joining room');

		expect(sent.status).toBe(409);
		expect(sent.body).toEqual({ error: 'Room Error', message: "Room 'r' is closed" });
	});

	it('masks any other error as a 500 without leaking its message', () => {
		const { res, sent } = buildResponse();

		handleError(res, new Error('connection reset by peer'), 'deleting room');

		expect(sent.status).toBe(500);
		expect(sent.body).toEqual({
			error: 'Internal Server Error',
			message: 'Unexpected error while deleting room'
		});
	});
});
