import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { Express } from 'express';
import { startTestServer, stopTestServer } from '../../../utils/helpers.js';
import { AuthMode, AuthType } from '../../../../src/typings/ce/index.js';

const BASE_URL = '/meet/api/v1';
const INTERNAL_BASE_URL = '/meet/internal-api/v1';
const ROOMS_URL = `${BASE_URL}/rooms`;

const API_KEY_HEADER = 'X-API-Key';
const API_KEY = 'meet-api-key';

const EXPIRATION_DATE = 1772129829000;

describe('Room API Security Tests', () => {
	let app: Express;

	let userCookie: string;
	let adminCookie: string;

	const changeSecurityPreferences = async ({
		usersCanCreateRooms = true,
		authRequired = true,
		authMode = AuthMode.NONE
	}) => {
		await request(app)
			.put(`${BASE_URL}/preferences/security`)
			.set(API_KEY_HEADER, API_KEY)
			.send({
				roomCreationPolicy: {
					allowRoomCreation: usersCanCreateRooms,
					requireAuthentication: authRequired
				},
				authentication: {
					authMode: authMode,
					method: {
						type: AuthType.SINGLE_USER
					}
				}
			});
	};

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

	beforeAll(async () => {
		app = await startTestServer();

		// Get cookies for admin and user
		userCookie = await loginUser('user', 'user');
		adminCookie = await loginUser('admin', 'admin');
	});

	afterAll(async () => {
		// Clean up created rooms
		const roomsResponse = await request(app).get(ROOMS_URL).set(API_KEY_HEADER, API_KEY);

		for (const room of roomsResponse.body) {
			await request(app).delete(`${ROOMS_URL}/${room.roomId}`).set(API_KEY_HEADER, API_KEY);
		}

		await stopTestServer();
	}, 20000);

	describe('Create Room Tests', () => {
		it('should succeed when users cannot create rooms, and request includes API key', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: false
			});

			const response = await request(app).post(ROOMS_URL).set(API_KEY_HEADER, API_KEY).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when users cannot create rooms, and user is authenticated as admin', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: false
			});

			const response = await request(app).post(ROOMS_URL).set('Cookie', adminCookie).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(200);
		});

		it('should fail when users cannot create rooms, and user is authenticated as user', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: false
			});

			const response = await request(app).post(ROOMS_URL).set('Cookie', userCookie).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(403);
		});

		it('should fail when users cannot create rooms, and user is not authenticated', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: false
			});

			const response = await request(app).post(ROOMS_URL).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when users can create rooms and auth is not required, and user is not authenticated', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: true,
				authRequired: false
			});

			const response = await request(app).post(ROOMS_URL).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when users can create rooms and auth is required, and user is authenticated', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: true,
				authRequired: true
			});

			const response = await request(app).post(ROOMS_URL).set('Cookie', userCookie).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(200);
		});

		it('should fail when users can create rooms and auth is required, and user is not authenticated', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: true,
				authRequired: true
			});

			const response = await request(app).post(ROOMS_URL).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(401);
		});
	});

	describe('Get Rooms Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app).get(ROOMS_URL).set(API_KEY_HEADER, API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(ROOMS_URL).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).get(ROOMS_URL).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(ROOMS_URL);
			expect(response.status).toBe(401);
		});
	});

	describe('Get Room Tests', () => {
		let roomId: string;
		let moderatorCookie: string;
		let publisherCookie: string;

		const generateParticipantToken = async (
			roomId: string,
			participantName: string,
			secret: string
		): Promise<string> => {
			// Disable authentication to generate the token
			await changeSecurityPreferences({
				authMode: AuthMode.NONE
			});

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
			const participantTokenCookie = cookies.find((cookie) =>
				cookie.startsWith('OvMeetParticipantToken=')
			) as string;
			return participantTokenCookie;
		};

		beforeAll(async () => {
			// Create a room and extract the roomId to test the get room endpoint
			const response = await request(app).post(ROOMS_URL).set(API_KEY_HEADER, API_KEY).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			roomId = response.body.roomId;

			// Extract the moderator and publisher secrets from the room URL
			const { moderatorRoomUrl, publisherRoomUrl } = response.body;
			const moderatorSecret = extractSecretByRoomUrl(moderatorRoomUrl, 'Moderator');
			const publisherSecret = extractSecretByRoomUrl(publisherRoomUrl, 'Publisher');

			// Generate participant tokens for the room and extract the cookies
			moderatorCookie = await generateParticipantToken(roomId, 'Moderator', moderatorSecret);
			publisherCookie = await generateParticipantToken(roomId, 'Publisher', publisherSecret);
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app).get(`${ROOMS_URL}/${roomId}`).set(API_KEY_HEADER, API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(`${ROOMS_URL}/${roomId}`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).get(`${ROOMS_URL}/${roomId}`).set('Cookie', userCookie);
			expect(response.status).toBe(401);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${ROOMS_URL}/${roomId}`);
			expect(response.status).toBe(401);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app).get(`${ROOMS_URL}/${roomId}`).set('Cookie', publisherCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is moderator of a different room', async () => {
			// Create a new room to get a different roomId
			const roomResponse = await request(app).post(ROOMS_URL).set(API_KEY_HEADER, API_KEY).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			const newRoomId = roomResponse.body.roomId;

			// Extract the moderator secret and generate a participant token for the new room
			const newModeratorSecret = extractSecretByRoomUrl(roomResponse.body.moderatorRoomUrl, 'Moderator');
			const newModeratorCookie = await generateParticipantToken(newRoomId, 'Moderator', newModeratorSecret);

			const response = await request(app).get(`${ROOMS_URL}/${roomId}`).set('Cookie', newModeratorCookie);
			expect(response.status).toBe(403);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences({
				authMode: AuthMode.NONE
			});

			const response = await request(app).get(`${ROOMS_URL}/${roomId}`).set('Cookie', moderatorCookie);
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderators, participant is moderator and user is authenticated', async () => {
			await changeSecurityPreferences({
				authMode: AuthMode.MODERATORS_ONLY
			});

			const response = await request(app)
				.get(`${ROOMS_URL}/${roomId}`)
				.set('Cookie', [moderatorCookie, userCookie]);
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for moderators, participant is moderator and user is not authenticated', async () => {
			await changeSecurityPreferences({
				authMode: AuthMode.MODERATORS_ONLY
			});

			const response = await request(app).get(`${ROOMS_URL}/${roomId}`).set('Cookie', moderatorCookie);
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all participants, participant is moderator and user is authenticated', async () => {
			await changeSecurityPreferences({
				authMode: AuthMode.ALL_USERS
			});

			const response = await request(app)
				.get(`${ROOMS_URL}/${roomId}`)
				.set('Cookie', [moderatorCookie, userCookie]);
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all participants, participant is moderator and user is not authenticated', async () => {
			await changeSecurityPreferences({
				authMode: AuthMode.ALL_USERS
			});

			const response = await request(app).get(`${ROOMS_URL}/${roomId}`).set('Cookie', moderatorCookie);
			expect(response.status).toBe(401);
		});
	});

	describe('Delete Room Tests', () => {
		let roomId: string;

		beforeEach(async () => {
			// Create a room and extract the roomId to test the delete room endpoint
			const response = await request(app).post(ROOMS_URL).set(API_KEY_HEADER, API_KEY).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			roomId = response.body.roomId;
		});

		it('should succeed when request includes API key', async () => {
			const response = await request(app).delete(`${ROOMS_URL}/${roomId}`).set(API_KEY_HEADER, API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).delete(`${ROOMS_URL}/${roomId}`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).delete(`${ROOMS_URL}/${roomId}`).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(`${ROOMS_URL}/${roomId}`);
			expect(response.status).toBe(401);
		});
	});

	describe.skip('Update Room Preferences Tests', () => {
		it('should succeed when request includes API key', async () => {
			const response = await request(app).put(ROOMS_URL).set(API_KEY_HEADER, API_KEY).send({});
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).put(ROOMS_URL).set('Cookie', adminCookie).send({});
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).put(ROOMS_URL).set('Cookie', userCookie).send({});
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(ROOMS_URL).send({});
			expect(response.status).toBe(401);
		});
	});

	describe('Get Participant Role Tests', () => {
		let roomId: string;
		let moderatorSecret: string;

		beforeAll(async () => {
			// Create a room and extract the roomId to test the get participant role endpoint
			const response = await request(app).post(ROOMS_URL).set(API_KEY_HEADER, API_KEY).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			roomId = response.body.roomId;

			// Extract the moderator secret from the room URL
			moderatorSecret = extractSecretByRoomUrl(response.body.moderatorRoomUrl, 'Moderator');
		});

		it('should succeed if user is not authenticated', async () => {
			const response = await request(app).get(`${INTERNAL_BASE_URL}/rooms/${roomId}/participant-role`).query({
				secret: moderatorSecret
			});
			expect(response.status).toBe(200);
		});
	});
});
