import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { deleteAllRooms, getFullPath, startTestServer } from '../../../helpers/request-helpers.js';

const roomBodyOfSize = (bytes: number): string => {
	const envelope = JSON.stringify({ roomName: 'big-body', padding: '' });
	return JSON.stringify({ roomName: 'big-body', padding: 'x'.repeat(bytes - envelope.length) });
};

describe('Room API Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('Request body size limit', () => {
		const postRoom = (body: string) =>
			request(app)
				.post(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`))
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.set('Content-Type', 'application/json')
				.send(body);

		it('answers 413 Payload Too Large, not 500, to a body over the limit', async () => {
			const response = await postRoom(roomBodyOfSize(101 * 1024));

			expect(response.status).toBe(413);
			expect(response.body).toEqual({
				error: 'Payload Too Large',
				message: 'Request body exceeds the limit of 102400 bytes'
			});
		});

		it('still accepts a body just under the limit', async () => {
			const response = await postRoom(roomBodyOfSize(99 * 1024));

			expect(response.status).toBe(201);
		});

		it('answers 413, not 500, to an oversized LiveKit webhook', async () => {
			const response = await request(app)
				.post('/livekit/webhook')
				.set('Content-Type', 'application/webhook+json')
				.send('x'.repeat(5 * 1024 * 1024));

			expect(response.status).toBe(413);
		});

		it('keeps answering 400 Bad Request to a malformed JSON body', async () => {
			const response = await postRoom('{"roomName": ');

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: 'Bad Request', message: 'Malformed body' });
		});
	});
});
