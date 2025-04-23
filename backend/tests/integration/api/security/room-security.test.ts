import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { Express } from 'express';
import { createRoom, generateParticipantToken, startTestServer } from '../../../utils/helpers.js';
import { AuthMode, UserRole } from '../../../../src/typings/ce/index.js';
import { MEET_API_KEY } from '../../../../src/environment.js';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';
import { changeSecurityPreferences, deleteAllRooms, loginUserAsRole } from '../../../utils/helpers.js';

const ROOMS_PATH = `${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`;
const INTERNAL_ROOMS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms`;

describe('Room API Security Tests', () => {
	let app: Express;
	let userCookie: string;
	let adminCookie: string;

	beforeAll(async () => {
		app = startTestServer();

		// Get cookies for admin and user
		userCookie = await loginUserAsRole(UserRole.USER);
		adminCookie = await loginUserAsRole(UserRole.ADMIN);
	});

	afterAll(async () => {
		await deleteAllRooms();
	}, 20000);

	describe('Create Room Tests', () => {
		it('should succeed when users cannot create rooms, and request includes API key', async () => {
			await changeSecurityPreferences(adminCookie, {
				usersCanCreateRooms: false
			});

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
				.send({});
			expect(response.status).toBe(200);
		});

		it('should succeed when users cannot create rooms, and user is authenticated as admin', async () => {
			await changeSecurityPreferences(adminCookie, {
				usersCanCreateRooms: false
			});

			const response = await request(app).post(ROOMS_PATH).set('Cookie', adminCookie).send({});
			expect(response.status).toBe(200);
		});

		it('should fail when users cannot create rooms, and user is authenticated as user', async () => {
			await changeSecurityPreferences(adminCookie, {
				usersCanCreateRooms: false
			});

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send({});
			expect(response.status).toBe(403);
		});

		it('should fail when users cannot create rooms, and user is not authenticated', async () => {
			await changeSecurityPreferences(adminCookie, {
				usersCanCreateRooms: false
			});

			const response = await request(app).post(ROOMS_PATH).send({});
			expect(response.status).toBe(401);
		});

		it('should succeed when users can create rooms and auth is not required, and user is not authenticated', async () => {
			await changeSecurityPreferences(adminCookie, {
				usersCanCreateRooms: true,
				authRequired: false
			});

			const response = await request(app).post(ROOMS_PATH).send({});
			expect(response.status).toBe(200);
		});

		it('should succeed when users can create rooms and auth is required, and user is authenticated', async () => {
			await changeSecurityPreferences(adminCookie, {
				usersCanCreateRooms: true,
				authRequired: true
			});

			const response = await request(app).post(ROOMS_PATH).set('Cookie', userCookie).send({});
			expect(response.status).toBe(200);
		});

		it('should fail when users can create rooms and auth is required, and user is not authenticated', async () => {
			await changeSecurityPreferences(adminCookie, {
				usersCanCreateRooms: true,
				authRequired: true
			});

			const response = await request(app).post(ROOMS_PATH).send({});
			expect(response.status).toBe(401);
		});
	});

	describe('Get Rooms Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app).get(ROOMS_PATH).set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(ROOMS_PATH).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).get(ROOMS_PATH).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(ROOMS_PATH);
			expect(response.status).toBe(401);
		});
	});

	describe('Bulk Delete Rooms Tests', () => {
		let roomId: string;

		beforeEach(async () => {
			const room = await createRoom();
			roomId = room.roomId;
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.delete(ROOMS_PATH)
				.query({ roomIds: roomId })
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(204);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.delete(ROOMS_PATH)
				.query({ roomIds: roomId })
				.set('Cookie', adminCookie);
			expect(response.status).toBe(204);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).delete(ROOMS_PATH).query({ roomIds: roomId }).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(ROOMS_PATH).query({ roomIds: roomId });
			expect(response.status).toBe(401);
		});
	});

	describe('Get Room Tests', () => {
		let roomId: string;
		let moderatorCookie: string;
		let publisherCookie: string;

		beforeAll(async () => {
			const room = await createRoom();
			roomId = room.roomId;

			// Extract the room secrets and generate participant tokens, saved as cookies
			const { moderatorSecret, publisherSecret } = MeetRoomHelper.extractSecretsFromRoom(room);
			moderatorCookie = await generateParticipantToken(adminCookie, roomId, 'Moderator', moderatorSecret);
			publisherCookie = await generateParticipantToken(adminCookie, roomId, 'Publisher', publisherSecret);
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomId}`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomId}`).set('Cookie', userCookie);
			expect(response.status).toBe(401);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomId}`);
			expect(response.status).toBe(401);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomId}`).set('Cookie', publisherCookie);
			expect(response.status).toBe(403);
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

			const response = await request(app).get(`${ROOMS_PATH}/${roomId}`).set('Cookie', newModeratorCookie);
			expect(response.status).toBe(403);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences(adminCookie, {
				authMode: AuthMode.NONE
			});

			const response = await request(app).get(`${ROOMS_PATH}/${roomId}`).set('Cookie', moderatorCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderators, participant is moderator and user is authenticated', async () => {
			await changeSecurityPreferences(adminCookie, {
				authMode: AuthMode.MODERATORS_ONLY
			});

			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}`)
				.set('Cookie', [moderatorCookie, userCookie]);
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for moderators, participant is moderator and user is not authenticated', async () => {
			await changeSecurityPreferences(adminCookie, {
				authMode: AuthMode.MODERATORS_ONLY
			});

			const response = await request(app).get(`${ROOMS_PATH}/${roomId}`).set('Cookie', moderatorCookie);
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all participants, participant is moderator and user is authenticated', async () => {
			await changeSecurityPreferences(adminCookie, {
				authMode: AuthMode.ALL_USERS
			});

			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}`)
				.set('Cookie', [moderatorCookie, userCookie]);
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all participants, participant is moderator and user is not authenticated', async () => {
			await changeSecurityPreferences(adminCookie, {
				authMode: AuthMode.ALL_USERS
			});

			const response = await request(app).get(`${ROOMS_PATH}/${roomId}`).set('Cookie', moderatorCookie);
			expect(response.status).toBe(401);
		});
	});

	describe('Delete Room Tests', () => {
		let roomId: string;

		beforeEach(async () => {
			const room = await createRoom();
			roomId = room.roomId;
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(204);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).delete(`${ROOMS_PATH}/${roomId}`).set('Cookie', adminCookie);
			expect(response.status).toBe(204);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).delete(`${ROOMS_PATH}/${roomId}`).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(`${ROOMS_PATH}/${roomId}`);
			expect(response.status).toBe(401);
		});
	});

	describe('Update Room Preferences Tests', () => {
		const roomPreferences = {
			recordingPreferences: { enabled: true },
			chatPreferences: { enabled: true },
			virtualBackgroundPreferences: { enabled: true }
		};

		let roomId: string;

		beforeAll(async () => {
			const room = await createRoom();
			roomId = room.roomId;
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.put(`${INTERNAL_ROOMS_PATH}/${roomId}`)
				.set('Cookie', adminCookie)
				.send(roomPreferences);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app)
				.put(`${INTERNAL_ROOMS_PATH}/${roomId}`)
				.set('Cookie', userCookie)
				.send(roomPreferences);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${INTERNAL_ROOMS_PATH}/${roomId}`).send(roomPreferences);
			expect(response.status).toBe(401);
		});
	});

	describe('Get Room Roles and Permissions Tests', () => {
		let roomId: string;

		beforeAll(async () => {
			const room = await createRoom();
			roomId = room.roomId;
		});

		it('should succeed if user is not authenticated', async () => {
			const response = await request(app).get(`${INTERNAL_ROOMS_PATH}/${roomId}/roles`);
			expect(response.status).toBe(200);
		});
	});

	describe('Get Room Role and Permissions Tests', () => {
		let roomId: string;
		let moderatorSecret: string;

		beforeAll(async () => {
			const room = await createRoom();
			roomId = room.roomId;

			// Extract the moderator secret
			({ moderatorSecret } = MeetRoomHelper.extractSecretsFromRoom(room));
		});

		it('should succeed if user is not authenticated', async () => {
			const response = await request(app).get(`${INTERNAL_ROOMS_PATH}/${roomId}/roles/${moderatorSecret}`);
			expect(response.status).toBe(200);
		});
	});
});
