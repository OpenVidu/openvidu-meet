import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { AuthMode } from '../../../../src/typings/ce/index.js';
import {
	changeSecurityPreferences,
	deleteAllRooms,
	disconnectFakeParticipants,
	loginUser,
	sleep,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

const PARTICIPANTS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/participants`;

describe('Participant API Security Tests', () => {
	const PARTICIPANT_NAME = 'TEST_PARTICIPANT';

	let app: Express;
	let adminCookie: string;

	beforeAll(async () => {
		app = startTestServer();
		adminCookie = await loginUser();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Generate Participant Token Tests', () => {
		let roomData: RoomData;

		beforeAll(async () => {
			roomData = await setupSingleRoom();
		});

		it('should succeed when no authentication is required and participant is publisher', async () => {
			await changeSecurityPreferences(AuthMode.NONE);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				secret: roomData.publisherSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences(AuthMode.NONE);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator and participant is publisher', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				secret: roomData.publisherSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).set('Cookie', adminCookie).send({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is publisher and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).set('Cookie', adminCookie).send({
				roomId: roomData.room.roomId,
				secret: roomData.publisherSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is publisher but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				secret: roomData.publisherSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).set('Cookie', adminCookie).send({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(401);
		});
	});

	describe('Refresh Participant Token Tests', () => {
		let roomData: RoomData;

		beforeAll(async () => {
			// Set short expiration for testing
			const initialTokenExpiration = INTERNAL_CONFIG.PARTICIPANT_TOKEN_EXPIRATION;
			INTERNAL_CONFIG.PARTICIPANT_TOKEN_EXPIRATION = '1s';

			roomData = await setupSingleRoom(true);
			await sleep('2s'); // Ensure the token is expired

			// Restore original expiration after setup
			INTERNAL_CONFIG.PARTICIPANT_TOKEN_EXPIRATION = initialTokenExpiration;
		});

		it('should succeed when no authentication is required and participant is publisher', async () => {
			await changeSecurityPreferences(AuthMode.NONE);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', roomData.publisherCookie)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.publisherSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences(AuthMode.NONE);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', roomData.moderatorCookie)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator and participant is publisher', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', roomData.publisherCookie)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.publisherSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', [adminCookie, roomData.moderatorCookie])
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', roomData.moderatorCookie)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is publisher and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', [adminCookie, roomData.publisherCookie])
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.publisherSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is publisher but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', roomData.publisherCookie)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.publisherSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', [adminCookie, roomData.moderatorCookie])
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', roomData.moderatorCookie)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(401);
		});
	});
});
