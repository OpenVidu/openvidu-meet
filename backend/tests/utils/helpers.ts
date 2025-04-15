/* eslint-disable @typescript-eslint/no-explicit-any */
import request from 'supertest';
import { Express } from 'express';
import { Server } from 'http';
import { createApp, registerDependencies } from '../../src/server.js';
import {
	SERVER_PORT,
	MEET_API_KEY,
	MEET_USER,
	MEET_SECRET,
	MEET_ADMIN_USER,
	MEET_ADMIN_SECRET,
	LIVEKIT_API_SECRET,
	LIVEKIT_API_KEY,
	MEET_NAME_ID
} from '../../src/environment.js';
import { AuthMode, AuthType, MeetRoom, UserRole, MeetRoomOptions } from '../../src/typings/ce/index.js';
import { expect } from '@jest/globals';
import INTERNAL_CONFIG from '../../src/config/internal-config.js';
import { ChildProcess, execSync, spawn } from 'child_process';
import { container } from '../../src/config/dependency-injector.config.js';
import { RoomService } from '../../src/services/room.service.js';

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

const fakeParticipantsProcesses = new Map<string, ChildProcess>();

export const sleep = (ms: number) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

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
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/preferences/security`)
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
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth/login`)
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
		.post(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
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

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
		.query(query);
};

export const updateRoomPreferences = async (roomId: string, preferences: any) => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	const userCookie = await loginUserAsRole(UserRole.ADMIN);
	return await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms/${roomId}`)
		.set('Cookie', userCookie)
		.send(preferences);
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
export const assertSuccessRoomsResponse = (
	response: any,
	expectedRoomLength: number,
	expectedMaxItems: number,
	expectedTruncated: boolean,
	expectedNextPageToken: boolean
) => {
	const { body } = response;
	expect(response.status).toBe(200);
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

/**
 * Retrieves information about a specific room from the API.
 *
 * @param roomId - The unique identifier of the room to retrieve
 * @param fields - Optional fields to filter in the response
 * @returns A Promise that resolves to the room data
 * @throws Error if the app instance is not defined
 */
export const getRoom = async (roomId: string, fields?: string) => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
		.query({ fields });
};

export const deleteRoom = async (roomId: string, query: Record<string, any> = {}) => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	return await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
		.query(query);
};

export const bulkDeleteRooms = async (roomIds: any[], force?: any) => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	return await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
		.query({ roomIds: roomIds.join(','), force });
};

export const assertEmptyRooms = async () => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	const response = await getRooms();

	assertSuccessRoomsResponse(response, 0, 10, false, false);
};

/**
 * Runs the room garbage collector to delete expired rooms.
 *
 * This function retrieves the RoomService from the dependency injection container
 * and calls its deleteExpiredRooms method to clean up expired rooms.
 * It then waits for 1 second before completing.
 */
export const runRoomGarbageCollector = async () => {
	if (!app) {
		throw new Error('App instance is not defined');
	}

	const roomService = container.get(RoomService);
	await (roomService as any)['deleteExpiredRooms']();

	await sleep(1000);
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
			.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
			.query({ fields: 'roomId', maxItems: 100, nextPageToken })
			.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
			.expect(200);

		nextPageToken = response.body.pagination?.nextPageToken ?? undefined;
		const roomIds = response.body.rooms.map((room: { roomId: string }) => room.roomId);

		if (roomIds.length === 0) {
			break;
		}

		await request(app)
			.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
			.query({ roomIds: roomIds.join(','), force: true })
			.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);

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
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/participants/token`)
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

/**
 * Adds a fake participant to a LiveKit room for testing purposes.
 *
 * This workflow involves three key steps:
 * 1. Create the LiveKit room manually
 * 2. Set room metadata to mark it as managed by OpenVidu Meet
 * 3. Connect a fake participant to the room
 *
 * @param roomId The ID of the room to join
 * @param participantName The name for the fake participant
 */
export const joinFakeParticipant = (roomId: string, participantName: string) => {
	// Step 1: Manually create the LiveKit room
	// In normal operation, the room is created when a real participant requests a token,
	// but for testing we need to create it ourselves since we're bypassing the token flow.
	// We set a short departureTimeout (1s) to ensure the room is quickly cleaned up
	// when our tests disconnect participants, preventing lingering test resources.
	const createRoomCommand = `lk room create --api-key ${LIVEKIT_API_KEY} --api-secret ${LIVEKIT_API_SECRET} --departure-timeout 1 ${roomId}`;
	runCommandSync(createRoomCommand);

	// Step 2: Set required room metadata
	// The room must have the createdBy field set to MEET_NAME_ID so that:
	// 1. OpenVidu Meet recognizes it as a managed room
	// 2. The room can be properly deleted through our API later
	// 3. Other OpenVidu Meet features know this room belongs to our system
	const metadata = JSON.stringify({ createdBy: MEET_NAME_ID });
	const updateMetadataCommand = `lk room update --metadata '${metadata}' --api-key ${LIVEKIT_API_KEY} --api-secret ${LIVEKIT_API_SECRET} ${roomId}`;
	runCommandSync(updateMetadataCommand);

	// Step 3: Join a fake participant with demo audio/video
	const process = spawn('lk', [
		'room',
		'join',
		'--identity',
		participantName,
		'--publish-demo',
		roomId,
		'--api-key',
		LIVEKIT_API_KEY,
		'--api-secret',
		LIVEKIT_API_SECRET
	]);

	// Store the process to be able to terminate it later
	fakeParticipantsProcesses.set(participantName, process);
};

export const disconnectFakeParticipants = () => {
	fakeParticipantsProcesses.forEach((process, participantName) => {
		process.kill();
		console.log(`Stopped process for participant ${participantName}`);
	});

	fakeParticipantsProcesses.clear();
};

// PRIVATE METHODS

const runCommandSync = (command: string): string => {
	try {
		const stdout = execSync(command, { encoding: 'utf-8' });
		return stdout;
	} catch (error) {
		console.error(`Error running command: ${error}`);
		throw error;
	}
};
