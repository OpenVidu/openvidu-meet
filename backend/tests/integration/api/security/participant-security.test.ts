import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Express } from 'express';
import { createRoom, generateParticipantToken, startTestServer, stopTestServer } from '../../../utils/helpers.js';
import { AuthMode, UserRole } from '../../../../src/typings/ce/index.js';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';
import { changeSecurityPreferences, deleteAllRooms, loginUserAsRole } from '../../../utils/helpers.js';

const PARTICIPANTS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/participants`;

describe('Participant API Security Tests', () => {
	const PARTICIPANT_NAME = 'testParticipant';

	let app: Express;

	let userCookie: string;
	let adminCookie: string;

	let roomId: string;
	let moderatorSecret: string;
	let publisherSecret: string;

	beforeAll(async () => {
		app = await startTestServer();

		// Get cookies for admin and user
		userCookie = await loginUserAsRole(UserRole.USER);
		adminCookie = await loginUserAsRole(UserRole.ADMIN);

		// Create a room and extract the roomId
		const room = await createRoom();
		roomId = room.roomId;

		// Extract the moderator and publisher secrets from the room
		({ moderatorSecret, publisherSecret } = MeetRoomHelper.extractSecretsFromRoom(room));
	});

	afterAll(async () => {
		await deleteAllRooms();
		await stopTestServer();
	}, 20000);

	describe('Generate Participant Token Tests', () => {
		it('should succeed when no authentication is required and participant is publisher', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.NONE });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.NONE });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator and participant is publisher', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).set('Cookie', userCookie).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is publisher and authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).set('Cookie', userCookie).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is publisher but not authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).set('Cookie', userCookie).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(401);
		});
	});

	describe('Refresh Participant Token Tests', () => {
		it('should succeed when no authentication is required and participant is publisher', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.NONE });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.NONE });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should succeed when authentication is required for moderator and participant is publisher', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', userCookie)
				.send({
					roomId,
					participantName: PARTICIPANT_NAME,
					secret: moderatorSecret
				});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is publisher and authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.ALL_USERS });

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', userCookie)
				.send({
					roomId,
					participantName: PARTICIPANT_NAME,
					secret: publisherSecret
				});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should fail when authentication is required for all users and participant is publisher but not authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.ALL_USERS });

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', userCookie)
				.send({
					roomId,
					participantName: PARTICIPANT_NAME,
					secret: moderatorSecret
				});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(adminCookie, { authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(401);
		});
	});

	describe('Delete Participant Tests', () => {
		let moderatorCookie: string;
		let publisherCookie: string;

		beforeAll(async () => {
			// Generate participant tokens for the room and extract the cookies
			moderatorCookie = await generateParticipantToken(adminCookie, roomId, 'Moderator', moderatorSecret);
			publisherCookie = await generateParticipantToken(adminCookie, roomId, 'Publisher', publisherSecret);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.delete(`${PARTICIPANTS_PATH}/${PARTICIPANT_NAME}`)
				.query({ roomId })
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
				.delete(`${PARTICIPANTS_PATH}/${PARTICIPANT_NAME}`)
				.query({ roomId })
				.set('Cookie', newModeratorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app)
				.delete(`${PARTICIPANTS_PATH}/${PARTICIPANT_NAME}`)
				.query({ roomId })
				.set('Cookie', publisherCookie);
			expect(response.status).toBe(403);
		});
	});
});
