import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MEET_API_KEY } from '../../../../src/environment.js';
import { AuthMode, MeetRecordingAccess } from '../../../../src/typings/ce/index.js';
import {
	changeSecurityPreferences,
	createRoom,
	deleteAllRecordings,
	deleteAllRooms,
	loginUser,
	startTestServer,
	updateRecordingAccessPreferencesInRoom
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';

const ROOMS_PATH = `${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`;
const INTERNAL_ROOMS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms`;

describe('Room API Security Tests', () => {
	let app: Express;
	let adminCookie: string;

	beforeAll(async () => {
		app = startTestServer();
		adminCookie = await loginUser();
	});

	afterAll(async () => {
		await deleteAllRooms();
		await deleteAllRecordings();
	});

	describe('Create Room Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
				.send({});
			expect(response.status).toBe(201);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).post(ROOMS_PATH).set('Cookie', adminCookie).send({});
			expect(response.status).toBe(201);
		});

		it('should fail when user is not authenticated', async () => {
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

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(ROOMS_PATH).query({ roomIds: roomId });
			expect(response.status).toBe(401);
		});
	});

	describe('Get Room Tests', () => {
		let roomData: RoomData;

		beforeAll(async () => {
			roomData = await setupSingleRoom();
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomData.room.roomId}`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomData.room.roomId}`);
			expect(response.status).toBe(401);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set('Cookie', roomData.moderatorCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set('Cookie', newRoomData.moderatorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set('Cookie', roomData.publisherCookie);
			expect(response.status).toBe(403);
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

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(`${ROOMS_PATH}/${roomId}`);
			expect(response.status).toBe(401);
		});
	});

	describe('Update Room Preferences Tests', () => {
		const roomPreferences = {
			recordingPreferences: {
				enabled: false,
				allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			},
			chatPreferences: { enabled: true },
			virtualBackgroundPreferences: { enabled: true }
		};

		let roomId: string;

		beforeAll(async () => {
			const room = await createRoom();
			roomId = room.roomId;
		});

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.put(`${INTERNAL_ROOMS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
				.send(roomPreferences);
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.put(`${INTERNAL_ROOMS_PATH}/${roomId}`)
				.set('Cookie', adminCookie)
				.send(roomPreferences);
			expect(response.status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${INTERNAL_ROOMS_PATH}/${roomId}`).send(roomPreferences);
			expect(response.status).toBe(401);
		});
	});

	describe('Get Room Preferences Tests', () => {
		let roomData: RoomData;

		beforeAll(async () => {
			roomData = await setupSingleRoom();
		});

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.get(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/preferences`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should fai when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/preferences`)
				.set('Cookie', adminCookie);
			expect(response.status).toBe(401);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/preferences`);
			expect(response.status).toBe(401);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.get(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/preferences`)
				.set('Cookie', roomData.moderatorCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.get(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/preferences`)
				.set('Cookie', newRoomData.moderatorCookie);
			expect(response.status).toBe(403);
		});

		it('should succeed when participant is publisher', async () => {
			const response = await request(app)
				.get(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/preferences`)
				.set('Cookie', roomData.publisherCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is publisher of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.get(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/preferences`)
				.set('Cookie', newRoomData.publisherCookie);
			expect(response.status).toBe(403);
		});
	});

	describe('Generate Recording Token Tests', () => {
		let roomData: RoomData;

		beforeAll(async () => {
			roomData = await setupSingleRoomWithRecording(true);
		});

		beforeEach(async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			);
		});

		it('should succeed when no authentication is required and participant is publisher', async () => {
			await changeSecurityPreferences(AuthMode.NONE);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.publisherSecret });
			expect(response.status).toBe(200);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences(AuthMode.NONE);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator and participant is publisher', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.publisherSecret });
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.set('Cookie', adminCookie)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is publisher and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.set('Cookie', adminCookie)
				.send({ secret: roomData.publisherSecret });
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is publisher but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.publisherSecret });
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.set('Cookie', adminCookie)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(401);
		});

		it('should fail when recording access is set to admin only', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(403);
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
		let roomData: RoomData;

		beforeAll(async () => {
			roomData = await setupSingleRoom();
		});

		it('should succeed if user is not authenticated', async () => {
			const response = await request(app).get(
				`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/roles/${roomData.moderatorSecret}`
			);
			expect(response.status).toBe(200);
		});
	});
});
