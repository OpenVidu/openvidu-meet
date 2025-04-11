/* eslint-disable @typescript-eslint/no-explicit-any */
import request from 'supertest';
import { Express } from 'express';
import { Server } from 'http';
import { createApp, registerDependencies } from '../../src/server.js';
import {
	SERVER_PORT,
	MEET_API_BASE_PATH_V1,
	MEET_INTERNAL_API_BASE_PATH_V1,
	MEET_API_KEY,
	MEET_USER,
	MEET_SECRET,
	MEET_ADMIN_USER,
	MEET_ADMIN_SECRET
} from '../../src/environment.js';
import { AuthMode, AuthType, MeetRoom, UserRole, MeetRoomOptions } from '../../src/typings/ce/index.js';
import { expect } from '@jest/globals';

export const API_KEY_HEADER = 'X-API-Key';

const CREDENTIALS = {
	user: {
		username: MEET_USER,
		password: MEET_SECRET
	},
	admin: {
		username: MEET_ADMIN_USER,
		password: MEET_ADMIN_SECRET
	}
};

let app: Express;
let server: Server;

/**
 * Starts the test server
 */
export const startTestServer = async (): Promise<Express> => {
	registerDependencies();
	app = createApp();

	return await new Promise<Express>((resolve, reject) => {
		server = app.listen(SERVER_PORT, async () => {
			try {
				// Check if the server is responding by hitting the health check route
				const response = await request(app).get('/meet/health');

				if (response.status === 200) {
					console.log('Test server started and healthy!');
					resolve(app);
				} else {
					reject(new Error('Test server not healthy'));
				}
			} catch (error: any) {
				reject(new Error('Failed to initialize server or global preferences: ' + error.message));
			}
		});

		// Handle server errors
		server.on('error', (error: any) => reject(new Error(`Test server startup error: ${error.message}`)));
	});
};

/**
 * Stops the test server
 */
export const stopTestServer = async (): Promise<void> => {
	if (!server) {
		throw new Error('Server is not running');
	}

	return new Promise<void>((resolve, reject) => {
		server.close((err) => {
			if (err) {
				reject(new Error(`Failed to stop server: ${err.message}`));
			} else {
				console.log('Test server stopped.');
				resolve();
			}

			// Clear the app instance
			app = undefined as unknown as Express;
			server = undefined as unknown as Server;
		});
	});
};

/**
 * Updates global security preferences
 */
export const changeSecurityPreferences = async (
	adminCookie: string,
	{ usersCanCreateRooms = true, authRequired = true, authMode = AuthMode.NONE }
) => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	await request(app)
		.put(`${MEET_INTERNAL_API_BASE_PATH_V1}/preferences/security`)
		.set('Cookie', adminCookie)
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
		})
		.expect(200);
};

/**
 * Logs in a user as a specific role (admin or user) and returns the access token cookie
 */
export const loginUserAsRole = async (role: UserRole): Promise<string> => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	const credentials = role === UserRole.ADMIN ? CREDENTIALS.admin : CREDENTIALS.user;
	const response = await request(app)
		.post(`${MEET_INTERNAL_API_BASE_PATH_V1}/auth/login`)
		.send(credentials)
		.expect(200);

	const cookies = response.headers['set-cookie'] as unknown as string[];
	const accessTokenCookie = cookies.find((cookie) => cookie.startsWith('OvMeetAccessToken=')) as string;
	return accessTokenCookie;
};

/**
 * Creates a room with the given prefix
 */
export const createRoom = async (options: MeetRoomOptions = {}): Promise<MeetRoom> => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	const response = await request(app)
		.post(`${MEET_API_BASE_PATH_V1}/rooms`)
		.set(API_KEY_HEADER, MEET_API_KEY)
		.send(options)
		.expect(200);
	return response.body;
};

/**
 * Performs a GET /rooms request with provided query parameters.
 * Returns the parsed response.
 */
export const getRooms = async (query: Record<string, any> = {}) => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	const response = await request(app)
		.get(`${MEET_API_BASE_PATH_V1}/rooms`)
		.set(API_KEY_HEADER, MEET_API_KEY)
		.query(query)
		.expect(200);
	return response.body;
};

/**
 * Asserts that a rooms response matches the expected values for testing purposes.
 * Validates the room array length and pagination properties.
 *
 * @param body - The API response body to validate
 * @param expectedRoomLength - The expected number of rooms in the response
 * @param expectedMaxItems - The expected maximum number of items in pagination
 * @param expectedTruncated - The expected value for pagination.isTruncated flag
 * @param expectedNextPageToken - The expected presence of pagination.nextPageToken
 *                               (if true, expects nextPageToken to be defined;
 *                                if false, expects nextPageToken to be undefined)
 */
export const assertRoomsResponse = (
	body: any,
	expectedRoomLength: number,
	expectedMaxItems: number,
	expectedTruncated: boolean,
	expectedNextPageToken: boolean
) => {
	expect(body).toBeDefined();
	expect(body.rooms).toBeDefined();
	expect(Array.isArray(body.rooms)).toBe(true);
	expect(body.rooms.length).toBe(expectedRoomLength);
	expect(body.pagination).toBeDefined();
	expect(body.pagination.isTruncated).toBe(expectedTruncated);

	expectedNextPageToken
		? expect(body.pagination.nextPageToken).toBeDefined()
		: expect(body.pagination.nextPageToken).toBeUndefined();
	expect(body.pagination.maxItems).toBe(expectedMaxItems);
};

export const assertEmptyRooms = async () => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	const body = await getRooms();

	assertRoomsResponse(body, 0, 10, false, false);
};

/**
 * Deletes all rooms
 */
export const deleteAllRooms = async () => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	let nextPageToken: string | undefined;

	do {
		const response: any = await request(app)
			.get(`${MEET_API_BASE_PATH_V1}/rooms`)
			.query({ fields: 'roomId', maxItems: 100, nextPageToken })
			.set(API_KEY_HEADER, MEET_API_KEY)
			.expect(200);

		nextPageToken = response.body.pagination?.nextPageToken ?? undefined;
		const roomIds = response.body.rooms.map((room: { roomId: string }) => room.roomId);

		if (roomIds.length === 0) {
			break;
		}

		await request(app)
			.delete(`${MEET_API_BASE_PATH_V1}/rooms`)
			.query({ roomIds: roomIds.join(','), force: true })
			.set(API_KEY_HEADER, MEET_API_KEY);

		await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second
	} while (nextPageToken);
};

/**
 * Generates a participant token for a room and returns the cookie containing the token
 */
export const generateParticipantToken = async (
	adminCookie: string,
	roomId: string,
	participantName: string,
	secret: string
): Promise<string> => {
	// Disable authentication to generate the token
	await changeSecurityPreferences(adminCookie, {
		authMode: AuthMode.NONE
	});

	// Generate the participant token
	const response = await request(app)
		.post(`${MEET_INTERNAL_API_BASE_PATH_V1}/participants/token`)
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
