import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MEET_API_KEY } from '../../../../src/environment.js';
import { MeetRecordingAccess } from '../../../../src/typings/ce/index.js';
import { expectValidStopRecordingResponse } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	generateRecordingTokenCookie,
	getRecordingUrl,
	loginUser,
	startTestServer,
	stopAllRecordings,
	stopRecording,
	updateRecordingAccessPreferencesInRoom
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';

const RECORDINGS_PATH = `${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`;
const INTERNAL_RECORDINGS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings`;

describe('Recording API Security Tests', () => {
	let app: Express;
	let adminCookie: string;

	beforeAll(async () => {
		app = startTestServer();
		adminCookie = await loginUser();
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

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.post(INTERNAL_RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should fail when user is authenticated as admin', async () => {
			const response = await request(app)
				.post(INTERNAL_RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set('Cookie', adminCookie);
			expect(response.status).toBe(401);
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

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.post(`${INTERNAL_RECORDINGS_PATH}/${roomData.recordingId}/stop`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should fail when user is authenticated as admin', async () => {
			const response = await request(app)
				.post(`${INTERNAL_RECORDINGS_PATH}/${roomData.recordingId}/stop`)
				.set('Cookie', adminCookie);
			expect(response.status).toBe(401);
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
		let roomData: RoomData;

		beforeAll(async () => {
			roomData = await setupSingleRoomWithRecording(true);
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app).get(RECORDINGS_PATH).set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(RECORDINGS_PATH).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is public and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app).get(RECORDINGS_PATH).set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is public and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app).get(RECORDINGS_PATH).set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when recording access is public and user is not authenticated', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);

			const response = await request(app).get(RECORDINGS_PATH);
			expect(response.status).toBe(401);
		});

		it('should succeed when recording access is admin-moderator-publisher and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app).get(RECORDINGS_PATH).set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is admin-moderator-publisher and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app).get(RECORDINGS_PATH).set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when recording access is admin-moderator and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app).get(RECORDINGS_PATH).set('Cookie', recordingCookie);
			expect(response.status).toBe(403);
		});

		it('should succeed when recording access is admin-moderator and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app).get(RECORDINGS_PATH).set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});
	});

	describe('Get Recording Tests', () => {
		let roomData: RoomData;
		let recordingId: string;

		beforeAll(async () => {
			roomData = await setupSingleRoomWithRecording(true);
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

		it('should succeed when recording access is public and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is public and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when recording access is public and user is not authenticated', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);

			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`);
			expect(response.status).toBe(401);
		});

		it('should succeed when recording access is admin-moderator-publisher and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is admin-moderator-publisher and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when recording access is admin-moderator and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', recordingCookie);
			expect(response.status).toBe(403);
		});

		it('should succeed when recording access is admin-moderator and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});
	});

	describe('Delete Recording Tests', () => {
		let roomData: RoomData;
		let recordingId: string;

		beforeEach(async () => {
			roomData = await setupSingleRoomWithRecording(true);
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

		it('should fail when recording access is public and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app)
				.delete(`${RECORDINGS_PATH}/${recordingId}`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(403);
		});

		it('should succeed when recording access is public and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app)
				.delete(`${RECORDINGS_PATH}/${recordingId}`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(204);
		});

		it('should fail when recording access is public and user is not authenticated', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);

			const response = await request(app).delete(`${RECORDINGS_PATH}/${recordingId}`);
			expect(response.status).toBe(401);
		});

		it('should fail when recording access is admin-moderator-publisher and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app)
				.delete(`${RECORDINGS_PATH}/${recordingId}`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(403);
		});

		it('should succeed when recording access is admin-moderator-publisher and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app)
				.delete(`${RECORDINGS_PATH}/${recordingId}`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(204);
		});

		it('should fail when recording access is admin-moderator and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app)
				.delete(`${RECORDINGS_PATH}/${recordingId}`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(403);
		});

		it('should succeed when recording access is admin-moderator and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app)
				.delete(`${RECORDINGS_PATH}/${recordingId}`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(204);
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
	});

	describe('Get Recording Media Tests', () => {
		let roomData: RoomData;
		let recordingId: string;

		beforeAll(async () => {
			roomData = await setupSingleRoomWithRecording(true);
			recordingId = roomData.recordingId!;
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is public and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is public and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is public and user is not authenticated', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);

			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/media`);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is admin-moderator-publisher and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is admin-moderator-publisher and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when recording access is admin-moderator and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(403);
		});

		it('should succeed when recording access is admin-moderator and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when using public access secret and user is not authenticated', async () => {
			const recordingUrlResponse = await getRecordingUrl(recordingId);
			expect(recordingUrlResponse.status).toBe(200);
			const recordingUrl = recordingUrlResponse.body.url;
			expect(recordingUrl).toBeDefined();

			// Parse the URL to extract the secret from the query parameters
			const parsedUrl = new URL(recordingUrl);
			const secret = parsedUrl.searchParams.get('secret');

			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/media?secret=${secret}`);
			expect(response.status).toBe(200);
		});

		it('should fail when using private access secret and user is not authenticated', async () => {
			const recordingUrlResponse = await getRecordingUrl(recordingId, true);
			expect(recordingUrlResponse.status).toBe(200);
			const recordingUrl = recordingUrlResponse.body.url;
			expect(recordingUrl).toBeDefined();

			// Parse the URL to extract the secret from the query parameters
			const parsedUrl = new URL(recordingUrl);
			const secret = parsedUrl.searchParams.get('secret');

			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/media?secret=${secret}`);
			expect(response.status).toBe(401);
		});

		it('should succeed when using private access secret and user is authenticated', async () => {
			const recordingUrlResponse = await getRecordingUrl(recordingId, true);
			expect(recordingUrlResponse.status).toBe(200);
			const recordingUrl = recordingUrlResponse.body.url;
			expect(recordingUrl).toBeDefined();

			// Parse the URL to extract the secret from the query parameters
			const parsedUrl = new URL(recordingUrl);
			const secret = parsedUrl.searchParams.get('secret');

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media?secret=${secret}`)
				.set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when using invalid access secret', async () => {
			const invalidRecordingUrl = `${RECORDINGS_PATH}/${recordingId}/media?secret=invalidSecret`;
			const response = await request(app).get(invalidRecordingUrl);
			expect(response.status).toBe(400);
		});
	});

	describe('Get Recording URL Tests', () => {
		let roomData: RoomData;
		let recordingId: string;

		beforeAll(async () => {
			roomData = await setupSingleRoomWithRecording(true);
			recordingId = roomData.recordingId!;
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/url`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/url`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is public and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/url`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is public and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/url`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when recording access is public and user is not authenticated', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.PUBLIC);

			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/url`);
			expect(response.status).toBe(401);
		});

		it('should succeed when recording access is admin-moderator-publisher and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/url`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when recording access is admin-moderator-publisher and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/url`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when recording access is admin-moderator and participant is publisher', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.publisherSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/url`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(403);
		});

		it('should succeed when recording access is admin-moderator and participant is moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
			const recordingCookie = await generateRecordingTokenCookie(roomData.room.roomId, roomData.moderatorSecret);

			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/url`)
				.set('Cookie', recordingCookie);
			expect(response.status).toBe(200);
		});
	});
});
