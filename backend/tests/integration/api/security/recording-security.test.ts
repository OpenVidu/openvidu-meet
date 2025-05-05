import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MEET_API_KEY } from '../../../../src/environment.js';
import { UserRole } from '../../../../src/typings/ce/index.js';
import { expectValidStopRecordingResponse } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	loginUserAsRole,
	startTestServer,
	stopAllRecordings,
	stopRecording
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';

const RECORDINGS_PATH = `${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`;
const INTERNAL_RECORDINGS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings`;

describe('Recording API Security Tests', () => {
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
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
	});

	describe('Start Recording Tests', () => {
		let roomData: RoomData;

		beforeAll(async () => {
			roomData = await setupSingleRoom(true);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.post(INTERNAL_RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set('Cookie', roomData.moderatorCookie);
			expect(response.status).toBe(201);

			// Stop recording to clean up
			const recordingId = response.body.recordingId;
			const stopResponse = await stopRecording(recordingId, roomData.moderatorCookie);
			expectValidStopRecordingResponse(stopResponse, recordingId, roomData.room.roomId);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.post(INTERNAL_RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set('Cookie', newRoomData.moderatorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app)
				.post(INTERNAL_RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set('Cookie', roomData.publisherCookie);
			expect(response.status).toBe(403);
		});
	});

	describe('Stop Recording Tests', () => {
		let roomData: RoomData;

		beforeEach(async () => {
			roomData = await setupSingleRoomWithRecording();
		});

		afterEach(async () => {
			await stopAllRecordings(roomData.moderatorCookie);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.post(`${INTERNAL_RECORDINGS_PATH}/${roomData.recordingId}/stop`)
				.set('Cookie', roomData.moderatorCookie);
			expect(response.status).toBe(202);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.post(`${INTERNAL_RECORDINGS_PATH}/${roomData.recordingId}/stop`)
				.set('Cookie', newRoomData.moderatorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app)
				.post(`${INTERNAL_RECORDINGS_PATH}/${roomData.recordingId}/stop`)
				.set('Cookie', roomData.publisherCookie);
			expect(response.status).toBe(403);
		});
	});

	describe('Get Recordings Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app).get(RECORDINGS_PATH).set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
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
		let recordingId: string;

		beforeAll(async () => {
			const roomData = await setupSingleRoomWithRecording(true);
			recordingId = roomData.recordingId!;
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
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
		let recordingId: string;

		beforeEach(async () => {
			const roomData = await setupSingleRoomWithRecording(true);
			recordingId = roomData.recordingId!;
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.delete(`${RECORDINGS_PATH}/${recordingId}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(204);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).delete(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', adminCookie);
			expect(response.status).toBe(204);
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
		let recordingId: string;

		beforeEach(async () => {
			const roomData = await setupSingleRoomWithRecording(true);
			recordingId = roomData.recordingId!;
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.delete(RECORDINGS_PATH)
				.query({ recordingIds: [recordingId] })
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(204);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.delete(RECORDINGS_PATH)
				.query({ recordingIds: [recordingId] })
				.set('Cookie', adminCookie);
			expect(response.status).toBe(204);
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

	describe('Get Recording Media Tests', () => {
		let recordingId: string;

		beforeAll(async () => {
			const roomData = await setupSingleRoomWithRecording(true);
			recordingId = roomData.recordingId!;
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set('Cookie', adminCookie);
			expect(response.status).toBe(200);
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
