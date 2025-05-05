import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { AuthMode, UserRole } from '../../../../src/typings/ce/index.js';
import {
	changeSecurityPreferences,
	deleteAllRooms,
	disconnectFakeParticipants,
	loginUserAsRole,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

const PARTICIPANTS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/participants`;

describe('Participant API Security Tests', () => {
	const PARTICIPANT_NAME = 'TEST_PARTICIPANT';

	let app: Express;
	let userCookie: string;
	let roomData: RoomData;

	beforeAll(async () => {
		app = startTestServer();
		userCookie = await loginUserAsRole(UserRole.USER);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Generate Participant Token Tests', () => {
		beforeAll(async () => {
			roomData = await setupSingleRoom();
		});

		it('should succeed when no authentication is required and participant is publisher', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.NONE });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.publisherSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.NONE });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator and participant is publisher', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.publisherSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).set('Cookie', userCookie).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is publisher and authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).set('Cookie', userCookie).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.publisherSecret
			});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is publisher but not authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.publisherSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).set('Cookie', userCookie).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(401);
		});
	});

	describe('Refresh Participant Token Tests', () => {
		beforeAll(async () => {
			roomData = await setupSingleRoom(true);
		});

		it('should succeed when no authentication is required and participant is publisher', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.NONE });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.publisherSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.NONE });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator and participant is publisher', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.publisherSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', userCookie)
				.send({
					roomId: roomData.room.roomId,
					participantName: PARTICIPANT_NAME,
					secret: roomData.moderatorSecret
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.MODERATORS_ONLY });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is publisher and authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.ALL_USERS });

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', userCookie)
				.send({
					roomId: roomData.room.roomId,
					participantName: PARTICIPANT_NAME,
					secret: roomData.publisherSecret
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is publisher but not authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.publisherSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.ALL_USERS });

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', userCookie)
				.send({
					roomId: roomData.room.roomId,
					participantName: PARTICIPANT_NAME,
					secret: roomData.moderatorSecret
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences({ authMode: AuthMode.ALL_USERS });

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token/refresh`).send({
				roomId: roomData.room.roomId,
				participantName: PARTICIPANT_NAME,
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(401);
		});
	});
});
