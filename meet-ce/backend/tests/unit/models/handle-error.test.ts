import { beforeAll, describe, expect, it } from '@jest/globals';
import type { Response } from 'express';
import { registerDependencies } from '../../../src/config/dependency-injector.config.js';
import { DocumentNotFoundError } from '../../../src/models/database.model.js';
import { handleError, OpenViduMeetError } from '../../../src/models/error.model.js';

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
	beforeAll(() => {
		registerDependencies();
	});

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
