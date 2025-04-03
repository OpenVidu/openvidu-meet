import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { Express } from 'express';
import { startTestServer, stopTestServer } from '../../../utils/server-setup.js';
import { AuthMode, AuthType } from '../../../../src/typings/ce/index.js';

const BASE_URL = '/meet/api/v1';
const INTERNAL_BASE_URL = '/meet/internal-api/v1';

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

	const extractSecretByroomUrl = (urlString: string, type: string): string => {
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
		const roomsResponse = await request(app).get(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY);

		for (const room of roomsResponse.body) {
			await request(app).delete(`${BASE_URL}/rooms/${room.roomId}`).set(API_KEY_HEADER, API_KEY);
		}

		await stopTestServer();
	});

	describe('Create Room Tests', () => {
		it('should success when users cannot create rooms, and request includes API key', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: false
			});

			const response = await request(app).post(`${BASE_URL}/rooms`).set('X-API-Key', 'meet-api-key').send({
				expirationDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(200);
		});

		it('should success when users cannot create rooms, and user is authenticated as admin', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: false
			});

			const response = await request(app).post(`${BASE_URL}/rooms`).set('Cookie', adminCookie).send({
				expirationDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(200);
		});

		it('should fail when users cannot create rooms, and user is authenticated as user', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: false
			});

			const response = await request(app).post(`${BASE_URL}/rooms`).set('Cookie', userCookie).send({
				expirationDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(403);
		});

		it('should fail when users cannot create rooms, and user is not authenticated', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: false
			});

			const response = await request(app).post(`${BASE_URL}/rooms`).send({
				expirationDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(401);
		});

		it('should success when users can create rooms and auth is not required, and user is not authenticated', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: true,
				authRequired: false
			});

			const response = await request(app).post(`${BASE_URL}/rooms`).send({
				expirationDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(200);
		});

		it('should success when users can create rooms and auth is required, and user is authenticated', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: true,
				authRequired: true
			});

			const response = await request(app).post(`${BASE_URL}/rooms`).set('Cookie', userCookie).send({
				expirationDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(200);
		});

		it('should fail when users can create rooms and auth is required, and user is not authenticated', async () => {
			await changeSecurityPreferences({
				usersCanCreateRooms: true,
				authRequired: true
			});

			const response = await request(app).post(`${BASE_URL}/rooms`).send({
				expirationDate: EXPIRATION_DATE
			});
			expect(response.status).toBe(401);
		});
	});

	describe('Get Rooms Tests', () => {
		it('should success when request includes API key', async () => {
			const response = await request(app).get(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY);
			expect(response.status).toBe(200);
		});

		it('should success when user is authenticated as admin', async () => {
			const response = await request(app).get(`${BASE_URL}/rooms`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).get(`${BASE_URL}/rooms`).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${BASE_URL}/rooms`);
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
			const response = await request(app).post(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY).send({
				expirationDate: EXPIRATION_DATE
			});
			roomId = response.body.roomId;

			// Extract the moderator and publisher secrets from the room URL
			const { moderatorRoomUrl, publisherRoomUrl } = response.body;
			const moderatorSecret = extractSecretByroomUrl(moderatorRoomUrl, 'Moderator');
			const publisherSecret = extractSecretByroomUrl(publisherRoomUrl, 'Publisher');

			// Generate participant tokens for the room and extract the cookies
			moderatorCookie = await generateParticipantToken(roomId, 'Moderator', moderatorSecret);
			publisherCookie = await generateParticipantToken(roomId, 'Publisher', publisherSecret);
		});

		it('should success when request includes API key', async () => {
			const response = await request(app).get(`${BASE_URL}/rooms/${roomId}`).set(API_KEY_HEADER, API_KEY);
			expect(response.status).toBe(200);
		});

		it('should success when user is authenticated as admin', async () => {
			const response = await request(app).get(`${BASE_URL}/rooms/${roomId}`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).get(`${BASE_URL}/rooms/${roomId}`).set('Cookie', userCookie);
			expect(response.status).toBe(401);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${BASE_URL}/rooms/${roomId}`);
			expect(response.status).toBe(401);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app).get(`${BASE_URL}/rooms/${roomId}`).set('Cookie', publisherCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is moderator of a different room', async () => {
			// Create a new room to get a different roomId
			const roomResponse = await request(app).post(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY).send({
				expirationDate: EXPIRATION_DATE
			});
			const newRoomId = roomResponse.body.roomId;

			// Extract the moderator secret and generate a participant token for the new room
			const newModeratorSecret = extractSecretByroomUrl(roomResponse.body.moderatorRoomUrl, 'Moderator');
			const newModeratorCookie = await generateParticipantToken(newRoomId, 'Moderator', newModeratorSecret);

			const response = await request(app).get(`${BASE_URL}/rooms/${roomId}`).set('Cookie', newModeratorCookie);
			expect(response.status).toBe(403);
		});

		it('should success when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences({
				authMode: AuthMode.NONE
			});

			const response = await request(app).get(`${BASE_URL}/rooms/${roomId}`).set('Cookie', moderatorCookie);
			expect(response.status).toBe(200);
		});

		it('should success when authentication is required for moderators, participant is moderator and user is authenticated', async () => {
			await changeSecurityPreferences({
				authMode: AuthMode.MODERATORS_ONLY
			});

			const response = await request(app)
				.get(`${BASE_URL}/rooms/${roomId}`)
				.set('Cookie', [moderatorCookie, userCookie]);
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for moderators, participant is moderator and user is not authenticated', async () => {
			await changeSecurityPreferences({
				authMode: AuthMode.MODERATORS_ONLY
			});

			const response = await request(app).get(`${BASE_URL}/rooms/${roomId}`).set('Cookie', moderatorCookie);
			expect(response.status).toBe(401);
		});

		it('should success when authentication is required for all participants, participant is moderator and user is authenticated', async () => {
			await changeSecurityPreferences({
				authMode: AuthMode.ALL_USERS
			});

			const response = await request(app)
				.get(`${BASE_URL}/rooms/${roomId}`)
				.set('Cookie', [moderatorCookie, userCookie]);
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all participants, participant is moderator and user is not authenticated', async () => {
			await changeSecurityPreferences({
				authMode: AuthMode.ALL_USERS
			});

			const response = await request(app).get(`${BASE_URL}/rooms/${roomId}`).set('Cookie', moderatorCookie);
			expect(response.status).toBe(401);
		});
	});

	describe('Delete Room Tests', () => {
		let roomId: string;

		beforeEach(async () => {
			// Create a room and extract the roomId to test the delete room endpoint
			const response = await request(app).post(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY).send({
				expirationDate: EXPIRATION_DATE
			});
			roomId = response.body.roomId;
		});

		it('should success when request includes API key', async () => {
			const response = await request(app).delete(`${BASE_URL}/rooms/${roomId}`).set(API_KEY_HEADER, API_KEY);
			expect(response.status).toBe(200);
		});

		it('should success when user is authenticated as admin', async () => {
			const response = await request(app).delete(`${BASE_URL}/rooms/${roomId}`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).delete(`${BASE_URL}/rooms/${roomId}`).set('Cookie', userCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(`${BASE_URL}/rooms/${roomId}`);
			expect(response.status).toBe(401);
		});
	});

	describe.skip('Update Room Preferences Tests', () => {
		it('should success when request includes API key', async () => {
			const response = await request(app).put(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY).send({});
			expect(response.status).toBe(200);
		});

		it('should success when user is authenticated as admin', async () => {
			const response = await request(app).put(`${BASE_URL}/rooms`).set('Cookie', adminCookie).send({});
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as user', async () => {
			const response = await request(app).put(`${BASE_URL}/rooms`).set('Cookie', userCookie).send({});
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${BASE_URL}/rooms`).send({});
			expect(response.status).toBe(401);
		});
	});

	describe('Get Participant Role Tests', () => {
		let roomId: string;
		let moderatorSecret: string;

		beforeAll(async () => {
			// Create a room and extract the roomId to test the get participant role endpoint
			const response = await request(app).post(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY).send({
				expirationDate: EXPIRATION_DATE
			});
			roomId = response.body.roomId;

			// Extract the moderator secret from the room URL
			moderatorSecret = extractSecretByroomUrl(response.body.moderatorRoomUrl, 'Moderator');
		});

		it('should success if user is not authenticated', async () => {
			const response = await request(app).get(`${INTERNAL_BASE_URL}/rooms/${roomId}/participant-role`).query({
				secret: moderatorSecret
			});
			expect(response.status).toBe(200);
		});
	});
});
