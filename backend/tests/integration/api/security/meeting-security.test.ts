import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Express } from 'express';
import { createRoom, generateParticipantToken, startTestServer } from '../../../utils/helpers.js';
import { UserRole } from '../../../../src/typings/ce/index.js';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';
import { deleteAllRooms, loginUserAsRole } from '../../../utils/helpers.js';

const MEETINGS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings`;

describe('Meeting API Security Tests', () => {
	let app: Express;
	let roomId: string;

	let adminCookie: string;
	let moderatorCookie: string;
	let publisherCookie: string;

	beforeAll(async () => {
		app = startTestServer();

		// Get cookie for admin
		adminCookie = await loginUserAsRole(UserRole.ADMIN);

		// Create a room and extract the roomId
		const room = await createRoom();
		roomId = room.roomId;

		// Extract the room secrets and generate participant tokens, saved as cookies
		const { moderatorSecret, publisherSecret } = MeetRoomHelper.extractSecretsFromRoom(room);
		moderatorCookie = await generateParticipantToken(adminCookie, roomId, 'Moderator', moderatorSecret);
		publisherCookie = await generateParticipantToken(adminCookie, roomId, 'Publisher', publisherSecret);
	});

	afterAll(async () => {
		await deleteAllRooms();
	}, 20000);

	describe('End Meeting Tests', () => {
		it('should succeed when participant is moderator', async () => {
			const response = await request(app).delete(`${MEETINGS_PATH}/${roomId}`).set('Cookie', moderatorCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			// Create a new room to get a different roomId
			const newRoom = await createRoom();
			const newRoomId = newRoom.roomId;

			// Extract the moderator secret and generate a participant token for the new room
			const { moderatorSecret } = MeetRoomHelper.extractSecretsFromRoom(newRoom);
			const newModeratorCookie = await generateParticipantToken(
				adminCookie,
				newRoomId,
				'Moderator',
				moderatorSecret
			);

			const response = await request(app).delete(`${MEETINGS_PATH}/${roomId}`).set('Cookie', newModeratorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app).delete(`${MEETINGS_PATH}/${roomId}`).set('Cookie', publisherCookie);
			expect(response.status).toBe(403);
		});
	});

	describe('Delete Participant from Meeting Tests', () => {
		const PARTICIPANT_NAME = 'testParticipant';

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}/participants/${PARTICIPANT_NAME}`)
				.set('Cookie', moderatorCookie);

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should fail when participant is moderator of a different room', async () => {
			// Create a new room to get a different roomId
			const newRoom = await createRoom();
			const newRoomId = newRoom.roomId;

			// Extract the moderator secret and generate a participant token for the new room
			const { moderatorSecret } = MeetRoomHelper.extractSecretsFromRoom(newRoom);
			const newModeratorCookie = await generateParticipantToken(
				adminCookie,
				newRoomId,
				'Moderator',
				moderatorSecret
			);

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}/participants/${PARTICIPANT_NAME}`)
				.set('Cookie', newModeratorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomId}/participants/${PARTICIPANT_NAME}`)
				.set('Cookie', publisherCookie);
			expect(response.status).toBe(403);
		});
	});
});
