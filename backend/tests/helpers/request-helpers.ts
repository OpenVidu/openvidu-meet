/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from '@jest/globals';
import { ChildProcess, execSync, spawn } from 'child_process';
import { Express } from 'express';
import ms, { StringValue } from 'ms';
import request, { Response } from 'supertest';
import { container } from '../../src/config/index.js';
import INTERNAL_CONFIG from '../../src/config/internal-config.js';
import {
	LIVEKIT_API_KEY,
	LIVEKIT_API_SECRET,
	MEET_ADMIN_SECRET,
	MEET_ADMIN_USER,
	MEET_API_KEY,
	MEET_SECRET,
	MEET_USER
} from '../../src/environment.js';
import { createApp, registerDependencies } from '../../src/server.js';
import { RecordingService, RoomService } from '../../src/services/index.js';
import {
	AuthMode,
	AuthType,
	MeetRoom,
	MeetRoomOptions,
	UserRole,
	WebhookPreferences
} from '../../src/typings/ce/index.js';

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
const fakeParticipantsProcesses = new Map<string, ChildProcess>();

export const sleep = (time: StringValue) => {
	return new Promise((resolve) => setTimeout(resolve, ms(time)));
};

/**
 * Starts the test server
 */
export const startTestServer = (): Express => {
	if (app) {
		return app;
	}

	registerDependencies();
	app = createApp();
	return app;
};

/**
 * Updates global security preferences
 */
export const changeSecurityPreferences = async ({
	usersCanCreateRooms = true,
	authRequired = true,
	authMode = AuthMode.NONE
}) => {
	checkAppIsRunning();

	const adminCookie = await loginUserAsRole(UserRole.ADMIN);
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
	checkAppIsRunning();

	const credentials = role === UserRole.ADMIN ? CREDENTIALS.admin : CREDENTIALS.user;
	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth/login`)
		.send(credentials)
		.expect(200);

	const cookies = response.headers['set-cookie'] as unknown as string[];
	const accessTokenCookie = cookies.find((cookie) =>
		cookie.startsWith(`${INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME}=`)
	) as string;
	return accessTokenCookie;
};

/**
 * Creates a room with the given prefix
 */
export const createRoom = async (options: MeetRoomOptions = {}): Promise<MeetRoom> => {
	checkAppIsRunning();

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
		.send(options)
		.expect(201);
	return response.body;
};

/**
 * Performs a GET /rooms request with provided query parameters.
 * Returns the parsed response.
 */
export const getRooms = async (query: Record<string, any> = {}) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
		.query(query);
};

export const updateRoomPreferences = async (roomId: string, preferences: any) => {
	checkAppIsRunning();

	const userCookie = await loginUserAsRole(UserRole.ADMIN);
	return await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms/${roomId}`)
		.set('Cookie', userCookie)
		.send(preferences);
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
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
		.query({ fields });
};

export const deleteRoom = async (roomId: string, query: Record<string, any> = {}) => {
	checkAppIsRunning();

	return await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
		.query(query);
};

export const bulkDeleteRooms = async (roomIds: any[], force?: any) => {
	checkAppIsRunning();

	return await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
		.query({ roomIds: roomIds.join(','), force });
};

/**
 * Runs the room garbage collector to delete expired rooms.
 *
 * This function retrieves the RoomService from the dependency injection container
 * and calls its deleteExpiredRooms method to clean up expired rooms.
 * It then waits for 1 second before completing.
 */
export const runRoomGarbageCollector = async () => {
	checkAppIsRunning();

	const roomService = container.get(RoomService);
	await (roomService as any)['deleteExpiredRooms']();
};

export const runReleaseActiveRecordingLock = async (roomId: string) => {
	checkAppIsRunning();

	const recordingService = container.get(RecordingService);
	await recordingService.releaseRecordingLockIfNoEgress(roomId);
};

/**
 * Deletes all rooms
 */
export const deleteAllRooms = async () => {
	checkAppIsRunning();

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
	} while (nextPageToken);
};

/**
 * Generates a participant token for a room and returns the cookie containing the token
 */
export const generateParticipantToken = async (
	roomId: string,
	participantName: string,
	secret: string
): Promise<string> => {
	checkAppIsRunning();

	// Disable authentication to generate the token
	await changeSecurityPreferences({
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
	const participantTokenCookie = cookies.find((cookie) =>
		cookie.startsWith(`${INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME}=`)
	) as string;
	return participantTokenCookie;
};

/**
 * Adds a fake participant to a LiveKit room for testing purposes.
 *
 * @param roomId The ID of the room to join
 * @param participantName The name for the fake participant
 */
export const joinFakeParticipant = async (roomId: string, participantName: string) => {
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
	fakeParticipantsProcesses.set(`${roomId}-${participantName}`, process);
	await sleep('1s');
};

export const endMeeting = async (roomId: string, moderatorCookie: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.delete(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings/${roomId}`)
		.set('Cookie', moderatorCookie)
		.send();
	await sleep('1s');
	return response;
};

export const disconnectFakeParticipants = async () => {
	fakeParticipantsProcesses.forEach((process, participantName) => {
		process.kill();
		console.log(`Stopped process for participant ${participantName}`);
	});

	fakeParticipantsProcesses.clear();
	await sleep('1s');
};

export const updateAppearancePreferences = async (preferences: any) => {
	checkAppIsRunning();
	const userCookie = await loginUserAsRole(UserRole.ADMIN);
	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/preferences/appearance`)
		.set('Cookie', userCookie)
		.send(preferences);
	return response;
};

export const getAppearancePreferences = async () => {
	checkAppIsRunning();
	const userCookie = await loginUserAsRole(UserRole.ADMIN);
	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/preferences/appearance`)
		.set('Cookie', userCookie)
		.send();
	return response;
};

export const updateWebbhookPreferences = async (preferences: WebhookPreferences) => {
	checkAppIsRunning();

	const userCookie = await loginUserAsRole(UserRole.ADMIN);
	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/preferences/webhooks`)
		.set('Cookie', userCookie)
		.send(preferences);

	return response;
};

/**
 * Generates a token for retrieving/deleting recordings from a room and returns the cookie containing the token
 */
export const generateRecordingToken = async (roomId: string, secret: string) => {
	checkAppIsRunning();

	// Disable authentication to generate the token
	await changeSecurityPreferences({
		authMode: AuthMode.NONE
	});

	// Generate the recording token
	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms/${roomId}/recording-token`)
		.send({
			secret
		})
		.expect(200);

	// Return the recording token cookie
	const cookies = response.headers['set-cookie'] as unknown as string[];
	const recordingTokenCookie = cookies.find((cookie) =>
		cookie.startsWith(`${INTERNAL_CONFIG.RECORDING_TOKEN_COOKIE_NAME}=`)
	) as string;
	return recordingTokenCookie;
};

export const startRecording = async (roomId: string, moderatorCookie = '') => {
	checkAppIsRunning();

	return await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings`)
		.set('Cookie', moderatorCookie)
		.send({
			roomId
		});
};

export const stopRecording = async (recordingId: string, moderatorCookie = '') => {
	checkAppIsRunning();

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings/${recordingId}/stop`)
		.set('Cookie', moderatorCookie)
		.send();
	await sleep('2.5s');

	return response;
};

export const getRecording = async (recordingId: string) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
};

export const deleteRecording = async (recordingId: string) => {
	checkAppIsRunning();

	return await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
};

export const getRecordingMedia = async (recordingId: string, range?: string) => {
	checkAppIsRunning();

	const req = request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}/media`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);

	if (range) {
		req.set('range', range);
	}

	return await req;
};

export const stopAllRecordings = async (moderatorCookie: string) => {
	checkAppIsRunning();

	const response = await getAllRecordings({ fields: 'recordingId' });
	const recordingIds: string[] = response.body.recordings.map(
		(recording: { recordingId: string }) => recording.recordingId
	);

	if (recordingIds.length === 0) {
		return;
	}

	console.log(`Stopping ${recordingIds.length} recordings...`);
	const tasks = recordingIds.map((recordingId: string) =>
		request(app)
			.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings/${recordingId}/stop`)
			.set('Cookie', moderatorCookie)
			.send()
	);
	await Promise.all(tasks);
	await sleep('1s');
};

export const getAllRecordings = async (query: Record<string, any> = {}) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
		.query(query);
};

export const bulkDeleteRecordings = async (recordingIds: any[]): Promise<Response> => {
	checkAppIsRunning();

	const response = await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`)
		.query({ recordingIds: recordingIds.join(',') })
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
	return response;
};

export const deleteAllRecordings = async () => {
	checkAppIsRunning();

	let nextPageToken: string | undefined;

	do {
		const response: any = await getAllRecordings({
			fields: 'recordingId',
			maxItems: 100,
			nextPageToken
		});
		expect(response.status).toBe(200);

		nextPageToken = response.body.pagination?.nextPageToken ?? undefined;
		const recordingIds = response.body.recordings.map(
			(recording: { recordingId: string }) => recording.recordingId
		);

		if (recordingIds.length === 0) {
			break;
		}

		await bulkDeleteRecordings(recordingIds);
	} while (nextPageToken);
};

// PRIVATE METHODS

const checkAppIsRunning = () => {
	if (!app) {
		throw new Error('App instance is not defined');
	}
};

const runCommandSync = (command: string): string => {
	try {
		const stdout = execSync(command, { encoding: 'utf-8' });
		return stdout;
	} catch (error) {
		console.error(`Error running command: ${error}`);
		throw error;
	}
};
