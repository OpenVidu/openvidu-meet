/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from '@jest/globals';
import { ChildProcess, spawn } from 'child_process';
import { Express } from 'express';
import ms, { StringValue } from 'ms';
import request, { Response } from 'supertest';
import { container } from '../../src/config/index.js';
import { INTERNAL_CONFIG } from '../../src/config/internal-config.js';
import {
	LIVEKIT_API_KEY,
	LIVEKIT_API_SECRET,
	MEET_INITIAL_ADMIN_PASSWORD,
	MEET_INITIAL_ADMIN_USER,
	MEET_INITIAL_API_KEY
} from '../../src/environment.js';
import { createApp, registerDependencies } from '../../src/server.js';
import { RecordingService, RoomService } from '../../src/services/index.js';
import {
	AuthMode,
	AuthTransportMode,
	MeetRecordingAccess,
	MeetRecordingInfo,
	MeetRecordingStatus,
	MeetRoom,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomOptions,
	ParticipantRole,
	WebhookConfig
} from '@openvidu-meet/typings';

const CREDENTIALS = {
	admin: {
		username: MEET_INITIAL_ADMIN_USER,
		password: MEET_INITIAL_ADMIN_PASSWORD
	}
};

let app: Express;
const fakeParticipantsProcesses = new Map<string, ChildProcess>();

export const sleep = (time: StringValue) => {
	return new Promise((resolve) => setTimeout(resolve, ms(time)));
};

export const startTestServer = (): Express => {
	if (app) {
		return app;
	}

	registerDependencies();
	app = createApp();
	return app;
};

export const generateApiKey = async (): Promise<string> => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth/api-keys`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken), accessToken)
		.send();
	expect(response.status).toBe(201);
	expect(response.body).toHaveProperty('key');
	return response.body.key;
};

export const getApiKeys = async () => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth/api-keys`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken), accessToken)
		.send();
	return response;
};

export const getRoomsAppearanceConfig = async () => {
	checkAppIsRunning();

	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/rooms/appearance`)
		.send();
	return response;
};

export const updateRoomsAppearanceConfig = async (config: any) => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/rooms/appearance`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken), accessToken)
		.send(config);
	return response;
};

export const getWebbhookConfig = async () => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/webhooks`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken), accessToken)
		.send();
	return response;
};

export const updateWebbhookConfig = async (config: WebhookConfig) => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/webhooks`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken), accessToken)
		.send(config);

	return response;
};

export const testWebhookUrl = async (url: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/webhooks/test`)
		.send({ url });
	return response;
};

export const getSecurityConfig = async () => {
	checkAppIsRunning();

	const response = await request(app).get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/security`).send();
	return response;
};

export const updateSecurityConfig = async (config: any) => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/security`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken), accessToken)
		.send(config);
	return response;
};

export const changeSecurityConfig = async (authMode: AuthMode) => {
	// Get current config to avoid overwriting other properties
	let response = await getSecurityConfig();
	expect(response.status).toBe(200);
	const currentConfig = response.body;

	currentConfig.authentication.authModeToAccessRoom = authMode;
	response = await updateSecurityConfig(currentConfig);
	expect(response.status).toBe(200);
};

export const changeAuthTransportMode = async (authTransportMode: AuthTransportMode) => {
	// Get current config to avoid overwriting other properties
	let response = await getSecurityConfig();
	expect(response.status).toBe(200);
	const currentConfig = response.body;

	currentConfig.authentication.authTransportMode = authTransportMode;
	response = await updateSecurityConfig(currentConfig);
	expect(response.status).toBe(200);
};

const getAuthTransportMode = async (): Promise<AuthTransportMode> => {
	const response = await getSecurityConfig();
	return response.body.authentication.authTransportMode;
};

/**
 * Logs in a user and returns the access token in the format
 * "Bearer <token>" or the cookie string if in cookie mode
 */
export const loginUser = async (): Promise<string> => {
	checkAppIsRunning();

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth/login`)
		.send(CREDENTIALS.admin)
		.expect(200);

	const authTransportMode = await getAuthTransportMode();

	// Return token in header or cookie based on transport mode
	if (authTransportMode === AuthTransportMode.COOKIE) {
		const cookie = extractCookieFromHeaders(response, INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME);
		return cookie!;
	}

	expect(response.body).toHaveProperty('accessToken');
	return `Bearer ${response.body.accessToken}`;
};

/**
 * Extracts cookie from response headers
 *
 * @param response - The supertest response
 * @param cookieName - Name of the cookie to extract
 * @returns The cookie string
 */
export const extractCookieFromHeaders = (response: Response, cookieName: string): string | undefined => {
	expect(response.headers['set-cookie']).toBeDefined();
	const cookies = response.headers['set-cookie'] as unknown as string[];
	return cookies?.find((cookie) => cookie.startsWith(`${cookieName}=`));
};

/**
 * Selects the appropriate HTTP header name based on the format of the provided access token.
 *
 * If the access token starts with 'Bearer ', the specified header name is returned (typically 'Authorization').
 * Otherwise, 'Cookie' is returned, indicating that the token should be sent as a cookie.
 */
const selectHeaderBasedOnToken = (headerName: string, accessToken: string): string => {
	return accessToken.startsWith('Bearer ') ? headerName : 'Cookie';
};

export const getProfile = async (accessToken: string) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users/profile`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken), accessToken)
		.send();
};

export const changePassword = async (currentPassword: string, newPassword: string, accessToken: string) => {
	checkAppIsRunning();

	return await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users/change-password`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken), accessToken)
		.send({ currentPassword, newPassword });
};

export const createRoom = async (options: MeetRoomOptions = {}): Promise<MeetRoom> => {
	checkAppIsRunning();

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
		.send(options)
		.expect(201);
	return response.body;
};

export const getRooms = async (query: Record<string, any> = {}) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
		.query(query);
};

/**
 * Retrieves information about a specific room from the API.
 *
 * @param roomId - The unique identifier of the room to retrieve
 * @param fields - Optional fields to filter in the response
 * @returns A Promise that resolves to the room data
 * @throws Error if the app instance is not defined
 */
export const getRoom = async (roomId: string, fields?: string, participantToken?: string, role?: ParticipantRole) => {
	checkAppIsRunning();

	const req = request(app).get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}`).query({ fields });

	if (participantToken && role) {
		req.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, participantToken).set(
			INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER,
			role
		);
	} else {
		req.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
	}

	return await req;
};

export const getRoomConfig = async (roomId: string) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/config`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
		.send();
};

export const updateRoomConfig = async (roomId: string, config: any) => {
	checkAppIsRunning();

	return await request(app)
		.put(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/config`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
		.send({ config });
};

export const updateRecordingAccessConfigInRoom = async (roomId: string, recordingAccess: MeetRecordingAccess) => {
	const response = await updateRoomConfig(roomId, {
		recording: {
			enabled: true,
			allowAccessTo: recordingAccess
		},
		chat: {
			enabled: true
		},
		virtualBackground: {
			enabled: true
		}
	});
	expect(response.status).toBe(200);
};

export const updateRoomStatus = async (roomId: string, status: string) => {
	checkAppIsRunning();

	return await request(app)
		.put(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/status`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
		.send({ status });
};

export const deleteRoom = async (roomId: string, query: Record<string, any> = {}) => {
	checkAppIsRunning();

	const result = await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
		.query(query);
	await sleep('1s');
	return result;
};

export const bulkDeleteRooms = async (roomIds: any[], withMeeting?: string, withRecordings?: string) => {
	checkAppIsRunning();

	const result = await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
		.query({ roomIds: roomIds.join(','), withMeeting, withRecordings });
	await sleep('1s');
	return result;
};

export const deleteAllRooms = async () => {
	checkAppIsRunning();

	let nextPageToken: string | undefined;

	do {
		const response = await getRooms({ fields: 'roomId', maxItems: 100, nextPageToken });
		expect(response.status).toBe(200);

		nextPageToken = response.body.pagination?.nextPageToken ?? undefined;
		const roomIds = response.body.rooms.map((room: { roomId: string }) => room.roomId);

		if (roomIds.length === 0) {
			break;
		}

		await bulkDeleteRooms(
			roomIds,
			MeetRoomDeletionPolicyWithMeeting.FORCE,
			MeetRoomDeletionPolicyWithRecordings.FORCE
		);
	} while (nextPageToken);
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
	await sleep('1s');
};

export const runReleaseActiveRecordingLock = async (roomId: string) => {
	checkAppIsRunning();

	const recordingService = container.get(RecordingService);
	await recordingService.releaseRecordingLockIfNoEgress(roomId);
};

export const getRoomRoles = async (roomId: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms/${roomId}/roles`)
		.send();
	return response;
};

export const getRoomRoleBySecret = async (roomId: string, secret: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms/${roomId}/roles/${secret}`)
		.send();
	return response;
};

export const generateParticipantTokenRequest = async (participantOptions: any, previousToken?: string) => {
	checkAppIsRunning();

	// Disable authentication to generate the token
	await changeSecurityConfig(AuthMode.NONE);

	// Generate the participant token
	const req = request(app).post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/participants/token`);

	if (previousToken) {
		req.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, previousToken), previousToken);
	}

	req.send(participantOptions);
	return await req;
};

/**
 * Generates a participant token for a room and returns the JWT token in the format "Bearer <token>"
 */
export const generateParticipantToken = async (
	roomId: string,
	secret: string,
	participantName: string
): Promise<string> => {
	const response = await generateParticipantTokenRequest({
		roomId,
		secret,
		participantName
	});
	expect(response.status).toBe(200);

	const authTransportMode = await getAuthTransportMode();

	// Return token in header or cookie based on transport mode
	if (authTransportMode === AuthTransportMode.COOKIE) {
		const cookie = extractCookieFromHeaders(response, INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME);
		return cookie!;
	}

	expect(response.body).toHaveProperty('token');
	return `Bearer ${response.body.token}`;
};

export const refreshParticipantToken = async (participantOptions: any, previousToken: string) => {
	checkAppIsRunning();

	// Disable authentication to generate the token
	await changeSecurityConfig(AuthMode.NONE);

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/participants/token/refresh`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, previousToken), previousToken)
		.send(participantOptions);
	return response;
};

/**
 * Adds a fake participant to a LiveKit room for testing purposes.
 *
 * @param roomId The ID of the room to join
 * @param participantIdentity The identity for the fake participant
 */
export const joinFakeParticipant = async (roomId: string, participantIdentity: string) => {
	const process = spawn('lk', [
		'room',
		'join',
		'--identity',
		participantIdentity,
		'--publish-demo',
		roomId,
		'--api-key',
		LIVEKIT_API_KEY,
		'--api-secret',
		LIVEKIT_API_SECRET
	]);

	// Store the process to be able to terminate it later
	fakeParticipantsProcesses.set(`${roomId}-${participantIdentity}`, process);
	await sleep('1s');
};

/**
 * Updates the metadata for a participant in a LiveKit room.
 *
 * @param roomId The ID of the room
 * @param participantIdentity The identity of the participant
 * @param metadata The metadata to update
 */
export const updateParticipantMetadata = async (roomId: string, participantIdentity: string, metadata: any) => {
	await ensureLivekitCliInstalled();
	spawn('lk', [
		'room',
		'participants',
		'update',
		'--room',
		roomId,
		'--identity',
		participantIdentity,
		'--metadata',
		JSON.stringify(metadata),
		'--api-key',
		LIVEKIT_API_KEY,
		'--api-secret',
		LIVEKIT_API_SECRET
	]);
	await sleep('1s');
};

/**
 * Verifies that the LiveKit CLI tool 'lk' is installed and accessible
 * @throws Error if 'lk' command is not found
 */
const ensureLivekitCliInstalled = async (): Promise<void> => {
	return new Promise((resolve, reject) => {
		const checkProcess = spawn('lk', ['--version'], {
			stdio: 'pipe'
		});

		let hasResolved = false;

		const resolveOnce = (success: boolean, message?: string) => {
			if (hasResolved) return;

			hasResolved = true;

			if (success) {
				resolve();
			} else {
				reject(new Error(message || 'LiveKit CLI check failed'));
			}
		};

		checkProcess.on('error', (error) => {
			if (error.message.includes('ENOENT')) {
				resolveOnce(false, '❌ LiveKit CLI tool "lk" is not installed or not in PATH.');
			} else {
				resolveOnce(false, `Failed to check LiveKit CLI: ${error.message}`);
			}
		});

		checkProcess.on('exit', (code) => {
			if (code === 0) {
				resolveOnce(true);
			} else {
				resolveOnce(false, `LiveKit CLI exited with code ${code}`);
			}
		});

		// Timeout after 5 seconds
		setTimeout(() => {
			checkProcess.kill();
			resolveOnce(false, 'LiveKit CLI check timed out');
		}, 5000);
	});
};

export const disconnectFakeParticipants = async () => {
	fakeParticipantsProcesses.forEach((process, participant) => {
		process.kill();
		console.log(`Stopped process for participant '${participant}'`);
	});

	fakeParticipantsProcesses.clear();
	await sleep('1s');
};

export const updateParticipant = async (
	roomId: string,
	participantIdentity: string,
	newRole: ParticipantRole,
	moderatorToken: string
) => {
	checkAppIsRunning();

	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings/${roomId}/participants/${participantIdentity}/role`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, moderatorToken), moderatorToken)
		.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR)
		.send({ role: newRole });
	return response;
};

export const kickParticipant = async (roomId: string, participantIdentity: string, moderatorToken: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.delete(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings/${roomId}/participants/${participantIdentity}`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, moderatorToken), moderatorToken)
		.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR)
		.send();
	return response;
};

export const endMeeting = async (roomId: string, moderatorToken: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.delete(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings/${roomId}`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, moderatorToken), moderatorToken)
		.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR)
		.send();
	await sleep('1s');
	return response;
};

export const generateRecordingTokenRequest = async (roomId: string, secret: string) => {
	checkAppIsRunning();

	// Disable authentication to generate the token
	await changeSecurityConfig(AuthMode.NONE);

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms/${roomId}/recording-token`)
		.send({
			secret
		});
	return response;
};

/**
 * Generates a token for retrieving/deleting recordings from a room and returns the JWT token in the format "Bearer <token>"
 */
export const generateRecordingToken = async (roomId: string, secret: string) => {
	const response = await generateRecordingTokenRequest(roomId, secret);
	expect(response.status).toBe(200);

	const authTransportMode = await getAuthTransportMode();

	// Return token in header or cookie based on transport mode
	if (authTransportMode === AuthTransportMode.COOKIE) {
		const cookie = extractCookieFromHeaders(response, INTERNAL_CONFIG.RECORDING_TOKEN_COOKIE_NAME);
		return cookie!;
	}

	expect(response.body).toHaveProperty('token');
	return `Bearer ${response.body.token}`;
};

export const startRecording = async (roomId: string, moderatorToken: string) => {
	checkAppIsRunning();

	return await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, moderatorToken), moderatorToken)
		.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR)
		.send({
			roomId
		});
};

export const stopRecording = async (recordingId: string, moderatorToken: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings/${recordingId}/stop`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, moderatorToken), moderatorToken)
		.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR)
		.send();
	await sleep('2.5s');

	return response;
};

export const getRecording = async (recordingId: string) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
};

export const getRecordingMedia = async (recordingId: string, range?: string) => {
	checkAppIsRunning();

	const req = request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}/media`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);

	if (range) {
		req.set('range', range);
	}

	return await req;
};

export const getRecordingUrl = async (recordingId: string, privateAccess = false) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}/url`)
		.query({ privateAccess })
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
};

export const deleteRecording = async (recordingId: string) => {
	checkAppIsRunning();

	return await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
};

export const bulkDeleteRecordings = async (recordingIds: any[], recordingToken?: string): Promise<Response> => {
	checkAppIsRunning();

	const req = request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`)
		.query({ recordingIds: recordingIds.join(',') });

	if (recordingToken) {
		req.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.RECORDING_TOKEN_HEADER, recordingToken), recordingToken);
	} else {
		req.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
	}

	return await req;
};

export const downloadRecordings = async (
	recordingIds: string[],
	asBuffer = true,
	recordingToken?: string
): Promise<Response> => {
	checkAppIsRunning();

	const req = request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/download`)
		.query({ recordingIds: recordingIds.join(',') });

	if (recordingToken) {
		req.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.RECORDING_TOKEN_HEADER, recordingToken), recordingToken);
	} else {
		req.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
	}

	if (asBuffer) {
		return await req.buffer().parse((res, cb) => {
			const data: Buffer[] = [];
			res.on('data', (chunk) => data.push(chunk));
			res.on('end', () => cb(null, Buffer.concat(data)));
		});
	}

	return await req;
};

export const stopAllRecordings = async (moderatorToken: string) => {
	checkAppIsRunning();

	const response = await getAllRecordings();

	const recordingIds: string[] = response.body.recordings
		.filter((rec: MeetRecordingInfo) => rec.status === MeetRecordingStatus.ACTIVE)
		.map((recording: { recordingId: string }) => recording.recordingId);

	if (recordingIds.length === 0) {
		return;
	}

	console.log(`Stopping ${recordingIds.length} recordings...`, recordingIds);
	const tasks = recordingIds.map((recordingId: string) =>
		request(app)
			.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings/${recordingId}/stop`)
			.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, moderatorToken), moderatorToken)
			.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR)
			.send()
	);
	const results = await Promise.all(tasks);

	// Check responses
	results.forEach((response) => {
		expect(response.status).toBe(202);
	});
	await sleep('1s');
};

export const getAllRecordings = async (query: Record<string, any> = {}) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
		.query(query);
};

export const getAllRecordingsFromRoom = async (recordingToken: string) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`)
		.set(selectHeaderBasedOnToken(INTERNAL_CONFIG.RECORDING_TOKEN_HEADER, recordingToken), recordingToken);
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
