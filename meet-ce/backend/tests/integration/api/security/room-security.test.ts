import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_INITIAL_API_KEY } from '../../../../src/environment.js';
import { AuthMode, AuthTransportMode, MeetRecordingAccess, ParticipantRole } from '@openvidu-meet/typings';
import {
	changeAuthTransportMode,
	changeSecurityConfig,
	createRoom,
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	loginUser,
	startTestServer,
	updateRecordingAccessConfigInRoom
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';

const ROOMS_PATH = `${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`;
const INTERNAL_ROOMS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms`;

describe('Room API Security Tests', () => {
	let app: Express;
	let adminAccessToken: string;

	beforeAll(async () => {
		app = startTestServer();
		adminAccessToken = await loginUser();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	describe('Create Room Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send({});
			expect(response.status).toBe(201);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.send({});
			expect(response.status).toBe(201);
		});

		it('should succeed when user is authenticated as admin via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app).post(ROOMS_PATH).set('Cookie', adminCookie).send({});
			expect(response.status).toBe(201);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).post(ROOMS_PATH).send({});
			expect(response.status).toBe(401);
		});
	});

	describe('Get Rooms Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.get(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(ROOMS_PATH)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app).post(ROOMS_PATH).set('Cookie', adminCookie).send({});
			expect(response.status).toBe(201);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
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
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.delete(ROOMS_PATH)
				.query({ roomIds: roomId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app)
				.delete(ROOMS_PATH)
				.query({ roomIds: roomId })
				.set('Cookie', adminCookie);
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
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
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app).get(`${ROOMS_PATH}/${roomData.room.roomId}`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomData.room.roomId}`);
			expect(response.status).toBe(401);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, newRoomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(403);
		});

		it('should succeed when participant is speaker', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.speakerToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.SPEAKER);
			expect(response.status).toBe(200);
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
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app).delete(`${ROOMS_PATH}/${roomId}`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(`${ROOMS_PATH}/${roomId}`);
			expect(response.status).toBe(401);
		});
	});

	describe('Get Room Config Tests', () => {
		let roomData: RoomData;

		beforeAll(async () => {
			roomData = await setupSingleRoom();
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}/config`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}/config`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}/config`)
				.set('Cookie', adminCookie);
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomData.room.roomId}/config`);
			expect(response.status).toBe(401);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}/config`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}/config`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, newRoomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(403);
		});

		it('should succeed when participant is speaker', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}/config`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.speakerToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.SPEAKER);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is speaker of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}/config`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, newRoomData.speakerToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.SPEAKER);
			expect(response.status).toBe(403);
		});
	});

	describe('Update Room Config Tests', () => {
		const roomConfig = {
			recording: {
				enabled: false,
				allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
			},
			chat: { enabled: true },
			virtualBackground: { enabled: true }
		};

		let roomId: string;

		beforeAll(async () => {
			const room = await createRoom();
			roomId = room.roomId;
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/config`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send({ config: roomConfig });
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/config`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.send({ config: roomConfig });
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/config`)
				.set('Cookie', adminCookie)
				.send({ config: roomConfig });
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${ROOMS_PATH}/${roomId}/config`).send({ config: roomConfig });
			expect(response.status).toBe(401);
		});
	});

	describe('Update Room Status Tests', () => {
		let roomId: string;

		beforeAll(async () => {
			const room = await createRoom();
			roomId = room.roomId;
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/status`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send({ status: 'open' });
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/status`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.send({ status: 'open' });
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/status`)
				.set('Cookie', adminCookie)
				.send({ status: 'open' });
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${ROOMS_PATH}/${roomId}/status`).send({ status: 'open' });
			expect(response.status).toBe(401);
		});
	});

	describe('Generate Recording Token Tests', () => {
		let roomData: RoomData;

		beforeAll(async () => {
			roomData = await setupSingleRoomWithRecording(true);
		});

		beforeEach(async () => {
			await updateRecordingAccessConfigInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER);
		});

		it('should succeed when no authentication is required and participant is speaker', async () => {
			await changeSecurityConfig(AuthMode.NONE);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.speakerSecret });
			expect(response.status).toBe(200);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityConfig(AuthMode.NONE);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator and participant is speaker', async () => {
			await changeSecurityConfig(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.speakerSecret });
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityConfig(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated via cookie', async () => {
			await changeSecurityConfig(AuthMode.MODERATORS_ONLY);

			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.set('Cookie', adminCookie)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityConfig(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is speaker and authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.send({ secret: roomData.speakerSecret });
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is speaker but not authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.speakerSecret });
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityConfig(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomData.room.roomId}/recording-token`)
				.send({ secret: roomData.moderatorSecret });
			expect(response.status).toBe(401);
		});

		it('should fail when recording access is set to admin only', async () => {
			await updateRecordingAccessConfigInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN);

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
