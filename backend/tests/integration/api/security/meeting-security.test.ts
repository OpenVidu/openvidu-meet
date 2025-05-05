import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { deleteAllRooms, disconnectFakeParticipants, startTestServer } from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

const MEETINGS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings`;

describe('Meeting API Security Tests', () => {
	let app: Express;
	let roomData: RoomData;

	beforeAll(() => {
		app = startTestServer();
	});

	beforeEach(async () => {
		roomData = await setupSingleRoom(true);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('End Meeting Tests', () => {
		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set('Cookie', roomData.moderatorCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set('Cookie', newRoomData.moderatorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set('Cookie', roomData.publisherCookie);
			expect(response.status).toBe(403);
		});
	});

	describe('Delete Participant from Meeting Tests', () => {
		const PARTICIPANT_NAME = 'TEST_PARTICIPANT';

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}`)
				.set('Cookie', roomData.moderatorCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}`)
				.set('Cookie', newRoomData.moderatorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}`)
				.set('Cookie', roomData.publisherCookie);
			expect(response.status).toBe(403);
		});
	});
});
