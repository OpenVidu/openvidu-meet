import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { createRoom, deleteAllRooms, getFullPath, startTestServer } from '../../../helpers/request-helpers.js';

describe('Room API Tests', () => {
	let app: Express;

	const bulkDelete = (roomIds: string[]) =>
		request(app)
			.delete(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`))
			.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
			.query({ roomIds: roomIds.join(',') });

	beforeAll(async () => {
		app = await startTestServer();
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('Bulk delete rooms cap', () => {
		it('answers 422 to more ids than one request may delete, without touching any room', async () => {
			const { roomId } = await createRoom({ roomName: 'survivor' });
			const tooMany = [
				roomId,
				...Array.from({ length: INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS }, (_, i) => `ghost-${i}`)
			];

			const response = await bulkDelete(tooMany);

			expectValidationError(
				response,
				'roomIds',
				`roomIds cannot exceed ${INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS} items`
			);
			const survivor = await request(app)
				.get(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}`))
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expect(survivor.status).toBe(200);
		});

		it('still deletes a request of exactly the cap', async () => {
			const { roomId } = await createRoom({ roomName: 'doomed' });
			const exactlyTheCap = [
				roomId,
				...Array.from({ length: INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS - 1 }, (_, i) => `ghost-${i}`)
			];

			const response = await bulkDelete(exactlyTheCap);

			expect(response.status).toBe(400);
			expect(response.body.deleted.map((room: { roomId: string }) => room.roomId)).toEqual([roomId]);
			expect(response.body.failed).toHaveLength(INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS - 1);
		});
	});
});
