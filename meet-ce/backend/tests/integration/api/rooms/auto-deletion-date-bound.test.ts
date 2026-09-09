import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { deleteAllRooms, getFullPath, startTestServer } from '../../../helpers/request-helpers.js';

describe('Room API Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('Create room with an autoDeletionDate beyond any representable date', () => {
		it('answers 422 instead of storing a date every consumer reads as Invalid Date', async () => {
			const response = await request(app)
				.post(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`))
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({ roomName: 'never-deleted', autoDeletionDate: 1e308 });

			expectValidationError(
				response,
				'autoDeletionDate',
				'autoDeletionDate must be a valid timestamp in milliseconds'
			);
			expect(new Date(1e308).toString()).toBe('Invalid Date');
		});
	});
});
