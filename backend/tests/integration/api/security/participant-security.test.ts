import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Express } from 'express';
import { startTestServer, stopTestServer } from '../../../utils/server-setup.js';
import { AuthMode, AuthType } from '../../../../src/typings/ce/index.js';

const BASE_URL = '/meet/api/v1';
const INTERNAL_BASE_URL = '/meet/internal-api/v1';
const PARTICIPANTS_URL = `${INTERNAL_BASE_URL}/participants`;

const API_KEY_HEADER = 'X-API-Key';
const API_KEY = 'meet-api-key';

const EXPIRATION_DATE = 1772129829000;
const PARTICIPANT_NAME = 'testParticipant';

describe('Participant API Security Tests', () => {
	let app: Express;

	let userCookie: string;

	let roomId: string;
	let moderatorSecret: string;
	let publisherSecret: string;

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

		// Get access token cookie for user
		userCookie = await loginUser('user', 'user');

		// Create a room and extract the roomId
		const response = await request(app).post(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY).send({
			autoDeletionDate: EXPIRATION_DATE
		});
		roomId = response.body.roomId;

		// Extract the moderator and publisher secrets from the room URL
		const { moderatorRoomUrl, publisherRoomUrl } = response.body;
		moderatorSecret = extractSecretByRoomUrl(moderatorRoomUrl, 'Moderator');
		publisherSecret = extractSecretByRoomUrl(publisherRoomUrl, 'Publisher');
	});

	afterAll(async () => {
		// Clean up created rooms
		const roomsResponse = await request(app).get(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY);

		for (const room of roomsResponse.body) {
			await request(app).delete(`${BASE_URL}/rooms/${room.roomId}`).set(API_KEY_HEADER, API_KEY);
		}

		await stopTestServer();
	}, 20000);

	describe('Generate Participant Token Tests', () => {
		it('should succeed when no authentication is required and participant is publisher', async () => {
			await changeSecurityPreferences(AuthMode.NONE);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences(AuthMode.NONE);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator and participant is publisher', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${PARTICIPANTS_URL}/token`)
				.set('Cookie', userCookie)
				.send({
					roomId,
					participantName: PARTICIPANT_NAME,
					secret: moderatorSecret
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is publisher and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_URL}/token`)
				.set('Cookie', userCookie)
				.send({
					roomId,
					participantName: PARTICIPANT_NAME,
					secret: publisherSecret
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is publisher but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_URL}/token`)
				.set('Cookie', userCookie)
				.send({
					roomId,
					participantName: PARTICIPANT_NAME,
					secret: moderatorSecret
				});
			expect(response.status).toBe(200);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(401);
		});
	});

	describe('Refresh Participant Token Tests', () => {
		it('should succeed when no authentication is required and participant is publisher', async () => {
			await changeSecurityPreferences(AuthMode.NONE);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should succeed when no authentication is required and participant is moderator', async () => {
			await changeSecurityPreferences(AuthMode.NONE);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should succeed when authentication is required for moderator and participant is publisher', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should succeed when authentication is required for moderator, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app)
				.post(`${PARTICIPANTS_URL}/token/refresh`)
				.set('Cookie', userCookie)
				.send({
					roomId,
					participantName: PARTICIPANT_NAME,
					secret: moderatorSecret
				});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should fail when authentication is required for moderator and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.MODERATORS_ONLY);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is publisher and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_URL}/token/refresh`)
				.set('Cookie', userCookie)
				.send({
					roomId,
					participantName: PARTICIPANT_NAME,
					secret: publisherSecret
				});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should fail when authentication is required for all users and participant is publisher but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: publisherSecret
			});
			expect(response.status).toBe(401);
		});

		it('should succeed when authentication is required for all users, participant is moderator and authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app)
				.post(`${PARTICIPANTS_URL}/token/refresh`)
				.set('Cookie', userCookie)
				.send({
					roomId,
					participantName: PARTICIPANT_NAME,
					secret: moderatorSecret
				});

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should fail when authentication is required for all users and participant is moderator but not authenticated', async () => {
			await changeSecurityPreferences(AuthMode.ALL_USERS);

			const response = await request(app).post(`${PARTICIPANTS_URL}/token/refresh`).send({
				roomId,
				participantName: PARTICIPANT_NAME,
				secret: moderatorSecret
			});
			expect(response.status).toBe(401);
		});
	});

	describe('Delete Participant Tests', () => {
		let moderatorCookie: string;
		let publisherCookie: string;

		const generateParticipantToken = async (
			roomId: string,
			participantName: string,
			secret: string
		): Promise<string> => {
			// Disable authentication to generate the token
			await changeSecurityPreferences(AuthMode.NONE);

			// Generate the participant token
			const response = await request(app)
				.post(`${PARTICIPANTS_URL}/token`)
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
			// Generate participant tokens for the room and extract the cookies
			moderatorCookie = await generateParticipantToken(roomId, 'Moderator', moderatorSecret);
			publisherCookie = await generateParticipantToken(roomId, 'Publisher', publisherSecret);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.delete(`${PARTICIPANTS_URL}/${PARTICIPANT_NAME}`)
				.query({ roomId })
				.set('Cookie', moderatorCookie);

			// The response code should be 404 to consider a success because there is no real participant inside the room
			expect(response.status).toBe(404);
		});

		it('should fail when participant is moderator of a different room', async () => {
			// Create a new room to get a different roomId
			const roomResponse = await request(app).post(`${BASE_URL}/rooms`).set(API_KEY_HEADER, API_KEY).send({
				autoDeletionDate: EXPIRATION_DATE
			});
			const newRoomId = roomResponse.body.roomId;

			// Extract the moderator secret and generate a participant token for the new room
			const newModeratorSecret = extractSecretByRoomUrl(roomResponse.body.moderatorRoomUrl, 'Moderator');
			const newModeratorCookie = await generateParticipantToken(newRoomId, 'Moderator', newModeratorSecret);

			const response = await request(app)
				.delete(`${PARTICIPANTS_URL}/${PARTICIPANT_NAME}`)
				.query({ roomId })
				.set('Cookie', newModeratorCookie);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is publisher', async () => {
			const response = await request(app)
				.delete(`${PARTICIPANTS_URL}/${PARTICIPANT_NAME}`)
				.query({ roomId })
				.set('Cookie', publisherCookie);
			expect(response.status).toBe(403);
		});
	});
});
