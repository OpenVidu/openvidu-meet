import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { AuthMode, AuthTransportMode } from '@openvidu-meet/typings';
import {
	changeAuthTransportMode,
	changeSecurityConfig,
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
	let adminAccessToken: string;

	beforeAll(async () => {
		app = startTestServer();
		adminAccessToken = await loginUser();
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

		it('should succeed when no authentication is required and participant is speaker', async () => {
			await changeSecurityConfig(AuthMode.NONE);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				secret: roomData.speakerSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityConfig(AuthMode.NONE);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator and participant is speaker', async () => {
			await changeSecurityConfig(AuthMode.MODERATORS_ONLY);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				secret: roomData.speakerSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityConfig(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).set('Cookie', adminCookie).send({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityConfig(AuthMode.MODERATORS_ONLY);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is speaker and authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.speakerSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is speaker but not authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

			const response = await request(app).post(`${PARTICIPANTS_PATH}/token`).send({
				roomId: roomData.room.roomId,
				secret: roomData.speakerSecret,
				participantName: PARTICIPANT_NAME
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

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

		it('should succeed when no authentication is required and participant is speaker', async () => {
			await changeSecurityConfig(AuthMode.NONE);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.speakerToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.speakerSecret,
					participantName: PARTICIPANT_NAME,
					participantIdentity: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityConfig(AuthMode.NONE);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.moderatorToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME,
					participantIdentity: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator and participant is speaker', async () => {
			await changeSecurityConfig(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.speakerToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.speakerSecret,
					participantName: PARTICIPANT_NAME,
					participantIdentity: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityConfig(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.moderatorToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME,
					participantIdentity: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			// Create a new room to obtain participant token in cookie mode
			const newRoomData = await setupSingleRoom(true);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set('Cookie', adminCookie)
				.set('Cookie', newRoomData.moderatorToken)
				.send({
					roomId: newRoomData.room.roomId,
					secret: newRoomData.moderatorSecret,
					participantName: PARTICIPANT_NAME,
					participantIdentity: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityConfig(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.moderatorToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME,
					participantIdentity: PARTICIPANT_NAME
				});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is speaker and authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.speakerToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.speakerSecret,
					participantName: PARTICIPANT_NAME,
					participantIdentity: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is speaker but not authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.speakerToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.speakerSecret,
					participantName: PARTICIPANT_NAME,
					participantIdentity: PARTICIPANT_NAME
				});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.moderatorToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME,
					participantIdentity: PARTICIPANT_NAME
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_PATH}/token/refresh`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.moderatorToken)
				.send({
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName: PARTICIPANT_NAME,
					participantIdentity: PARTICIPANT_NAME
				});
			expect(response.status).toBe(401);
		});
	});
});
