import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Express } from 'express';
import { startTestServer, stopTestServer } from '../../../utils/server-setup.js';
import { AuthMode, AuthType } from '../../../../src/typings/ce/index.js';

const BASE_URL = '/meet/api/v1';
const INTERNAL_BASE_URL = '/meet/internal-api/v1';
const RECORDINGS_URL = `${BASE_URL}/recordings`;

const API_KEY_HEADER = 'X-API-Key';
const API_KEY = 'meet-api-key';

const EXPIRATION_DATE = 1772129829000;

describe('Room API Security Tests', () => {
	let app: Express;

	let userCookie: string;
	let adminCookie: string;

	let roomId: string;
	let recordingId: string;

	let moderatorCookie: string;
	let publisherCookie: string;

	const loginUser = async (username: string, password: string): Promise<string> => {
		const response = await request(app)
			.post(`${INTERNAL_BASE_URL}/auth/login`)
			.send({
				username,
				password
			})
			.expect(200);

		const cookies = response.headers['set-cookie'] as unknown as string[];
		const accessTokenCookie = cookies.find((cookie) => cookie.startsWith('OvMeetAccessToken=')) as string;
		return accessTokenCookie;
	};

	const extractSecretByRoomUrl = (urlString: string, type: string): string => {
		const url = new URL(urlString);
		const secret = url.searchParams.get('secret');

		if (!secret) throw new Error(`${type} secret not found`);

		return secret;
	};

	const changeSecurityPreferences = async (authMode: AuthMode) => {
		await request(app)
			.put(`${BASE_URL}/preferences/security`)
			.set(API_KEY_HEADER, API_KEY)
			.send({
				authentication: {
					authMode: authMode,
					method: {
						type: AuthType.SINGLE_USER
					}
				}
			});
	};

	const generateParticipantToken = async (
		roomId: string,
		participantName: string,
		secret: string
	): Promise<string> => {
		// Disable authentication to generate the token
		await changeSecurityPreferences(AuthMode.NONE);

		// Generate the participant token
		const response = await request(app)
			.post(`${INTERNAL_BASE_URL}/participants/token`)
			.send({
				roomId,
				participantName,
				secret
			})
			.expect(200);

		// Return the participant token cookie
		const cookies = response.headers['set-cookie'] as unknown as string[];
		const participantTokenCookie = cookies.find((cookie) => cookie.startsWith('OvMeetParticipantToken=')) as string;
		return participantTokenCookie;
	};

	beforeAll(async () => {
		app = await startTestServer();

		// Get cookies for admin and user
		userCookie = await loginUser('user', 'user');
		adminCookie = await loginUser('admin', 'admin');

		// Create a room and extract the roomId
		const response = await request(app).post(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY).send({
			expirationDate: EXPIRATION_DATE
		});
		roomId = response.body.roomId;
		recordingId = `${roomId}--recordingId--uid`;

		// Extract the moderator and publisher secrets from the room URL
		const { moderatorRoomUrl, publisherRoomUrl } = response.body;
		const moderatorSecret = extractSecretByRoomUrl(moderatorRoomUrl, 'Moderator');
		const publisherSecret = extractSecretByRoomUrl(publisherRoomUrl, 'Publisher');

		// Generate participant tokens for the room and extract the cookies
		moderatorCookie = await generateParticipantToken(roomId, 'Moderator', moderatorSecret);
		publisherCookie = await generateParticipantToken(roomId, 'Publisher', publisherSecret);
	});

	afterAll(async () => {
		// Clean up created rooms
		const roomsResponse = await request(app).get(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY);

		for (const room of roomsResponse.body) {
			await request(app).delete(`${BASE_URL}/rooms/${room.roomId}`).set(API_KEY_HEADER, API_KEY);
		}

		await stopTestServer();
	}, 20000);

	describe('Start Recording Tests', () => {
		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.post(`${RECORDINGS_URL}`)
				.send({ roomId })
				.set('Cookie', moderatorCookie);

			// The response code should be 500 to consider a success
			// This is because there is no real participant inside the room and the recording will fail
			expect(response.status).toBe(500);
			expect(response.body).toHaveProperty('message', 'Failed to start recording');
		}, 40000); // Increase timeout for this test because of the timeout until the recording fails to start

		it('should fail when participant is moderator of a different room', async () => {
			// Create a new room to get a different roomId
			const roomResponse = await request(app).post(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY).send({
				expirationDate: EXPIRATION_DATE
			});
			const newRoomId = roomResponse.body.roomId;

			// Extract the moderator secret and generate a participant token for the new room
			const newModeratorSecret = extractSecretByRoomUrl(roomResponse.body.moderatorRoomUrl, 'Moderator');
			const newModeratorCookie = await generateParticipantToken(newRoomId, 'Moderator', newModeratorSecret);

			const response = await request(app)
				.post(`${RECORDINGS_URL}`)
				.send({ roomId })
				.set('Cookie', newModeratorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app)
				.post(`${RECORDINGS_URL}`)
				.send({ roomId })
				.set('Cookie', publisherCookie);
			expect(response.status).toBe(403);
		});
	});

	describe('Stop Recording Tests', () => {
		it('should succeed when participant is moderator', async () => {
			const response = await request(app).put(`${RECORDINGS_URL}/${recordingId}`).set('Cookie', moderatorCookie);
			// The response code should be 404 to consider a success because the recording does not exist
			expect(response.status).toBe(404);
		});

		it('should fail when participant is moderator of a different room', async () => {
			// Create a new room to get a different roomId
			const roomResponse = await request(app).post(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY).send({
				expirationDate: EXPIRATION_DATE
			});
			const newRoomId = roomResponse.body.roomId;

			// Extract the moderator secret and generate a participant token for the new room
			const newModeratorSecret = extractSecretByRoomUrl(roomResponse.body.moderatorRoomUrl, 'Moderator');
			const newModeratorCookie = await generateParticipantToken(newRoomId, 'Moderator', newModeratorSecret);

			const response = await request(app)
				.put(`${RECORDINGS_URL}/${recordingId}`)
				.set('Cookie', newModeratorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app).put(`${RECORDINGS_URL}/${recordingId}`).set('Cookie', publisherCookie);
			expect(response.status).toBe(403);
		});
	});

	describe('Get Recordings Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app).get(RECORDINGS_URL).set(API_KEY_HEADER, API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(RECORDINGS_URL).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).get(RECORDINGS_URL).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(RECORDINGS_URL);
			expect(response.status).toBe(401);
		});
	});

	describe('Get Recording Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app).get(`${RECORDINGS_URL}/${recordingId}`).set(API_KEY_HEADER, API_KEY);
			// The response code should be 404 to consider a success because the recording does not exist
			expect(response.status).toBe(404);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(`${RECORDINGS_URL}/${recordingId}`).set('Cookie', adminCookie);
			// The response code should be 404 to consider a success because the recording does not exist
			expect(response.status).toBe(404);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).get(`${RECORDINGS_URL}/${recordingId}`).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${RECORDINGS_URL}/${recordingId}`);
			expect(response.status).toBe(401);
		});
	});

	describe('Delete Recording Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app).delete(`${RECORDINGS_URL}/${recordingId}`).set(API_KEY_HEADER, API_KEY);
			// The response code should be 404 to consider a success because the recording does not exist
			expect(response.status).toBe(404);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).delete(`${RECORDINGS_URL}/${recordingId}`).set('Cookie', adminCookie);
			// The response code should be 404 to consider a success because the recording does not exist
			expect(response.status).toBe(404);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).delete(`${RECORDINGS_URL}/${recordingId}`).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(`${RECORDINGS_URL}/${recordingId}`);
			expect(response.status).toBe(401);
		});
	});

	describe('Bulk Delete Recordings Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app)
				.delete(RECORDINGS_URL)
				.set(API_KEY_HEADER, API_KEY)
				.query({ recordingIds: [recordingId] });
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.delete(RECORDINGS_URL)
				.set('Cookie', adminCookie)
				.query({ recordingIds: [recordingId] });
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app)
				.delete(RECORDINGS_URL)
				.set('Cookie', userCookie)
				.query({ recordingIds: [recordingId] });
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app)
				.delete(RECORDINGS_URL)
				.query({ recordingIds: [recordingId] });
			expect(response.status).toBe(401);
		});
	});

	describe('Stream Recording Tests', () => {
		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(`${INTERNAL_BASE_URL}/recordings/${recordingId}/stream`)
				.set('Cookie', adminCookie);
			// The response code should be 404 to consider a success because the recording does not exist
			expect(response.status).toBe(404);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app)
				.get(`${INTERNAL_BASE_URL}/recordings/${recordingId}/stream`)
				.set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${INTERNAL_BASE_URL}/recordings/${recordingId}/stream`);
			expect(response.status).toBe(401);
		});
	});
});
