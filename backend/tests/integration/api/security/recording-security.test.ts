import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Express } from 'express';
import {
	API_KEY_HEADER,
	createRoom,
	deleteAllRooms,
	generateParticipantToken,
	loginUserAsRole,
	startTestServer,
	stopTestServer
} from '../../../utils/helpers.js';
import { MEET_API_BASE_PATH_V1, MEET_INTERNAL_API_BASE_PATH_V1, MEET_API_KEY } from '../../../../src/environment.js';
import { UserRole } from '../../../../src/typings/ce/index.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';

const RECORDINGS_PATH = `${MEET_API_BASE_PATH_V1}/recordings`;
const INTERNAL_RECORDINGS_PATH = `${MEET_INTERNAL_API_BASE_PATH_V1}/recordings`;

describe('Room API Security Tests', () => {
	let app: Express;

	let userCookie: string;
	let adminCookie: string;

	let roomId: string;
	let recordingId: string;

	let moderatorCookie: string;
	let publisherCookie: string;

	beforeAll(async () => {
		app = await startTestServer();

		// Get cookies for admin and user
		userCookie = await loginUserAsRole(UserRole.USER);
		adminCookie = await loginUserAsRole(UserRole.ADMIN);

		// Create a room and extract the roomId
		const room = await createRoom();
		roomId = room.roomId;
		recordingId = `${roomId}--recordingId--uid`;

		// Extract the room secrets and generate participant tokens, saved as cookies
		const { moderatorSecret, publisherSecret } = MeetRoomHelper.extractSecretsFromRoom(room);
		moderatorCookie = await generateParticipantToken(adminCookie, roomId, 'Moderator', moderatorSecret);
		publisherCookie = await generateParticipantToken(adminCookie, roomId, 'Publisher', publisherSecret);
	});

	afterAll(async () => {
		await deleteAllRooms();
		await stopTestServer();
	}, 20000);

	describe('Start Recording Tests', () => {
		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.post(INTERNAL_RECORDINGS_PATH)
				.send({ roomId })
				.set('Cookie', moderatorCookie);

			// The response code should be 409 to consider a success
			// This is because there is no real participant inside the room and the recording will fail
			expect(response.status).toBe(409);
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
				.post(INTERNAL_RECORDINGS_PATH)
				.send({ roomId })
				.set('Cookie', newModeratorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app)
				.post(INTERNAL_RECORDINGS_PATH)
				.send({ roomId })
				.set('Cookie', publisherCookie);
			expect(response.status).toBe(403);
		});
	});

	describe('Stop Recording Tests', () => {
		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.post(`${INTERNAL_RECORDINGS_PATH}/${recordingId}/stop`)
				.set('Cookie', moderatorCookie);
			// The response code should be 404 to consider a success because the recording does not exist
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
				.post(`${INTERNAL_RECORDINGS_PATH}/${recordingId}/stop`)
				.set('Cookie', newModeratorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app)
				.post(`${INTERNAL_RECORDINGS_PATH}/${recordingId}/stop`)
				.set('Cookie', publisherCookie);
			expect(response.status).toBe(403);
		});
	});

	describe('Get Recordings Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app).get(RECORDINGS_PATH).set(API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(RECORDINGS_PATH).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).get(RECORDINGS_PATH).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(RECORDINGS_PATH);
			expect(response.status).toBe(401);
		});
	});

	describe('Get Recording Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}`)
				.set(API_KEY_HEADER, MEET_API_KEY);
			// The response code should be 404 to consider a success because the recording does not exist
			expect(response.status).toBe(404);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', adminCookie);
			// The response code should be 404 to consider a success because the recording does not exist
			expect(response.status).toBe(404);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`);
			expect(response.status).toBe(401);
		});
	});

	describe('Delete Recording Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.delete(`${RECORDINGS_PATH}/${recordingId}`)
				.set(API_KEY_HEADER, MEET_API_KEY);
			// The response code should be 404 to consider a success because the recording does not exist
			expect(response.status).toBe(404);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).delete(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', adminCookie);
			// The response code should be 404 to consider a success because the recording does not exist
			expect(response.status).toBe(404);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).delete(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(`${RECORDINGS_PATH}/${recordingId}`);
			expect(response.status).toBe(401);
		});
	});

	describe('Bulk Delete Recordings Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.delete(RECORDINGS_PATH)
				.query({ recordingIds: [recordingId] })
				.set(API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.delete(RECORDINGS_PATH)
				.query({ recordingIds: [recordingId] })
				.set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app)
				.delete(RECORDINGS_PATH)
				.query({ recordingIds: [recordingId] })
				.set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app)
				.delete(RECORDINGS_PATH)
				.query({ recordingIds: [recordingId] });
			expect(response.status).toBe(401);
		});
	});

	describe('Stream Recording Tests', () => {
		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set('Cookie', adminCookie);
			// The response code should be 404 to consider a success because the recording does not exist
			expect(response.status).toBe(404);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/media`);
			expect(response.status).toBe(401);
		});
	});
});
