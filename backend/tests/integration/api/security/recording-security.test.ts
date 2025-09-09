import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MEET_INITIAL_API_KEY } from '../../../../src/environment.js';
import { MeetRecordingAccess, ParticipantRole } from '../../../../src/typings/ce/index.js';
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
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
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
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
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
				.set('Cookie', roomData.moderatorCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(201);

			// Stop recording to clean up
			const recordingId = response.body.recordingId;
			const stopResponse = await stopRecording(recordingId, roomData.moderatorCookie);
			expectValidStopRecordingResponse(stopResponse, recordingId, roomData.room.roomId, roomData.room.roomName);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.post(INTERNAL_RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set('Cookie', newRoomData.moderatorCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is speaker', async () => {
			const response = await request(app)
				.post(INTERNAL_RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set('Cookie', roomData.speakerCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.SPEAKER);
			expect(response.status).toBe(403);
		});
	});

	describe('Stop Recording Tests', () => {
		let roomData: RoomData;

		beforeAll(async () => {
			roomData = await setupSingleRoomWithRecording();
		});

		afterAll(async () => {
			await stopAllRecordings(roomData.moderatorCookie);
		});

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.post(`${INTERNAL_RECORDINGS_PATH}/${roomData.recordingId}/stop`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);

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
				.set('Cookie', roomData.moderatorCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(202);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.post(`${INTERNAL_RECORDINGS_PATH}/${roomData.recordingId}/stop`)
				.set('Cookie', newRoomData.moderatorCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is speaker', async () => {
			const response = await request(app)
				.post(`${INTERNAL_RECORDINGS_PATH}/${roomData.recordingId}/stop`)
				.set('Cookie', roomData.speakerCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.SPEAKER);
			expect(response.status).toBe(403);
		});
	});

	describe('Recording Resource Operations', () => {
		let roomData: RoomData;
		let recordingId: string;

		beforeAll(async () => {
			roomData = await setupSingleRoomWithRecording(true);
			recordingId = roomData.recordingId!;
		});

		describe('Get Recordings Tests', () => {
			it('should succeed when request includes API key', async () => {
				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as admin', async () => {
				const response = await request(app).get(RECORDINGS_PATH).set('Cookie', adminCookie);
				expect(response.status).toBe(200);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app).get(RECORDINGS_PATH).set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app).get(RECORDINGS_PATH).set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});

			it('should fail when recording access is admin_moderator and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app).get(RECORDINGS_PATH).set('Cookie', recordingCookie);
				expect(response.status).toBe(403);
			});

			it('should succeed when recording access is admin_moderator and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app).get(RECORDINGS_PATH).set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});
		});

		describe('Get Recording Tests', () => {
			it('should succeed when request includes API key', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as admin', async () => {
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).set('Cookie', adminCookie);
				expect(response.status).toBe(200);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});

			it('should fail when recording access is admin_moderator and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(403);
			});

			it('should succeed when recording access is admin_moderator and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
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

				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}?secret=${secret}`);
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

				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}?secret=${secret}`);
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
					.get(`${RECORDINGS_PATH}/${recordingId}?secret=${secret}`)
					.set('Cookie', adminCookie);
				expect(response.status).toBe(200);
			});
		});

		describe('Delete Recording Tests', () => {
			let fakeRecordingId: string;

			beforeAll(async () => {
				/*
				  Use a simulated recording ID matching the API's expected format.
				  This allows testing the delete endpoint logic without deleting a real recording.
				  As a result, all successful delete tests will expect a 404 Not Found response.
				*/
				fakeRecordingId = `${roomData.room.roomId}--EG_xxx--uid`;
			});

			it('should succeed when request includes API key', async () => {
				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${fakeRecordingId}`)
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
				expect(response.status).toBe(404);
			});

			it('should succeed when user is authenticated as admin', async () => {
				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${fakeRecordingId}`)
					.set('Cookie', adminCookie);
				expect(response.status).toBe(404);
			});

			it('should fail when recording access is admin_moderator_speaker and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${fakeRecordingId}`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(403);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${fakeRecordingId}`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(404);
			});

			it('should fail when recording access is admin_moderator and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${fakeRecordingId}`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(403);
			});

			it('should succeed when recording access is admin_moderator and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${fakeRecordingId}`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(404);
			});
		});

		describe('Bulk Delete Recordings Tests', () => {
			let fakeRecordingId: string;

			beforeAll(async () => {
				/*
				  Use a simulated recording ID matching the API's expected format.
				  This allows testing the delete endpoint logic without deleting a real recording.
				  As a result, all successful delete tests will expect a 400 response with failed recordings.
				*/
				fakeRecordingId = `${roomData.room.roomId}--EG_xxx--uid`;
			});

			it('should succeed when request includes API key', async () => {
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: fakeRecordingId })
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
				expect(response.status).toBe(400);
			});

			it('should succeed when user is authenticated as admin', async () => {
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: fakeRecordingId })
					.set('Cookie', adminCookie);
				expect(response.status).toBe(400);
			});

			it('should fail when recording access is admin_moderator_speaker and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: fakeRecordingId })
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(403);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: fakeRecordingId })
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(400);
			});

			it('should fail when recording access is admin_moderator and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: fakeRecordingId })
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(403);
			});

			it('should succeed when recording access is admin_moderator and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: fakeRecordingId })
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(400);
			});
		});

		describe('Get Recording Media Tests', () => {
			it('should succeed when request includes API key', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as admin', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set('Cookie', adminCookie);
				expect(response.status).toBe(200);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});

			it('should fail when recording access is admin_moderator and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(403);
			});

			it('should succeed when recording access is admin_moderator and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

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
			it('should succeed when request includes API key', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as admin', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set('Cookie', adminCookie);
				expect(response.status).toBe(200);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});

			it('should fail when recording access is admin_moderator and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(403);
			});

			it('should succeed when recording access is admin_moderator and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});
		});

		describe('Download Recordings as ZIP Tests', () => {
			it('should succeed when request includes API key', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as admin', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set('Cookie', adminCookie);
				expect(response.status).toBe(200);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});

			it('should succeed when recording access is admin_moderator_speaker and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(
					roomData.room.roomId,
					MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
				);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});

			it('should fail when recording access is admin_moderator and participant is speaker', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.speakerSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(403);
			});

			it('should succeed when recording access is admin_moderator and participant is moderator', async () => {
				await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);
				const recordingCookie = await generateRecordingTokenCookie(
					roomData.room.roomId,
					roomData.moderatorSecret
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set('Cookie', recordingCookie);
				expect(response.status).toBe(200);
			});
		});
	});
});
