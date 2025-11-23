import { expect } from '@jest/globals';
import {
	AuthMode,
	MeetAppearanceConfig,
	MeetRecordingAccess,
	MeetRecordingInfo,
	MeetRecordingStatus,
	MeetRoom,
	MeetRoomConfig,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions,
	MeetRoomOptions,
	MeetRoomStatus,
	SecurityConfig,
	WebhookConfig
} from '@openvidu-meet/typings';
import { ChildProcess, spawn } from 'child_process';
import { Express } from 'express';
import ms, { StringValue } from 'ms';
import request, { Response } from 'supertest';
import { container, initializeEagerServices } from '../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../src/config/internal-config.js';
import { MEET_ENV } from '../../src/environment.js';
import { createApp, registerDependencies } from '../../src/server.js';
import { ApiKeyService } from '../../src/services/api-key.service.js';
import { GlobalConfigService } from '../../src/services/global-config.service.js';
import { RecordingService } from '../../src/services/recording.service.js';
import { RoomService } from '../../src/services/room.service.js';

const CREDENTIALS = {
	admin: {
		username: MEET_ENV.INITIAL_ADMIN_USER,
		password: MEET_ENV.INITIAL_ADMIN_PASSWORD
	}
};

let app: Express;
const fakeParticipantsProcesses = new Map<string, ChildProcess>();

export const sleep = (time: StringValue) => {
	return new Promise((resolve) => setTimeout(resolve, ms(time)));
};

export const startTestServer = async (): Promise<Express> => {
	if (app) {
		return app;
	}

	registerDependencies();
	app = createApp();
	await initializeEagerServices();
	return app;
};

export const generateApiKey = async (): Promise<string> => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/api-keys`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send();
	expect(response.status).toBe(201);
	expect(response.body).toHaveProperty('key');
	return response.body.key;
};

export const getApiKeys = async () => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/api-keys`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send();
	return response;
};

export const deleteApiKeys = async () => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.delete(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/api-keys`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send();
	return response;
};

export const restoreDefaultApiKeys = async () => {
	const apiKeyService = container.get(ApiKeyService);

	// Check if there are existing API keys and delete them
	const existingKeys = await apiKeyService.getApiKeys();

	if (existingKeys.length > 0) {
		await apiKeyService.deleteApiKeys();
	}

	await apiKeyService.initializeApiKey();
};

export const getRoomsAppearanceConfig = async () => {
	checkAppIsRunning();

	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/rooms/appearance`)
		.send();
	return response;
};

export const updateRoomsAppearanceConfig = async (config: { appearance: MeetAppearanceConfig }) => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/rooms/appearance`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send(config);
	return response;
};

export const getWebbhookConfig = async () => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/webhooks`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send();
	return response;
};

export const updateWebbhookConfig = async (config: WebhookConfig) => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/webhooks`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
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

export const updateSecurityConfig = async (config: SecurityConfig) => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/security`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
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

export const restoreDefaultGlobalConfig = async () => {
	const configService = container.get(GlobalConfigService);
	const defaultGlobalConfig = configService['getDefaultConfig']();
	await configService.saveGlobalConfig(defaultGlobalConfig);
};

/**
 * Logs in a user and returns the access token in the format "Bearer <token>"
 */
export const loginUser = async (): Promise<string> => {
	checkAppIsRunning();

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth/login`)
		.send(CREDENTIALS.admin)
		.expect(200);

	expect(response.body).toHaveProperty('accessToken');
	return `Bearer ${response.body.accessToken}`;
};

export const getProfile = async (accessToken: string) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users/profile`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send();
};

export const changePassword = async (currentPassword: string, newPassword: string, accessToken: string) => {
	checkAppIsRunning();

	return await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users/change-password`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send({ currentPassword, newPassword });
};

export const createRoom = async (options: MeetRoomOptions = {}): Promise<MeetRoom> => {
	checkAppIsRunning();

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.send(options)
		.expect(201);
	return response.body;
};

export const getRooms = async (query: Record<string, unknown> = {}) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.query(query);
};

/**
 * Retrieves information about a specific room from the API.
 *
 * @param roomId - The unique identifier of the room to retrieve
 * @param fields - Optional fields to filter in the response
 * @param roomMemberToken - Optional room member token for authentication
 * @returns A Promise that resolves to the room data
 * @throws Error if the app instance is not defined
 */
export const getRoom = async (roomId: string, fields?: string, roomMemberToken?: string) => {
	checkAppIsRunning();

	const req = request(app).get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}`).query({ fields });

	if (roomMemberToken) {
		req.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMemberToken);
	} else {
		req.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
	}

	return await req;
};

export const getRoomConfig = async (roomId: string): Promise<Response> => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/config`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.send();
};

export const updateRoomConfig = async (roomId: string, config: Partial<MeetRoomConfig>) => {
	checkAppIsRunning();

	return await request(app)
		.put(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/config`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.send({ config });
};

export const updateRecordingAccessConfigInRoom = async (roomId: string, recordingAccess: MeetRecordingAccess) => {
	const response = await updateRoomConfig(roomId, {
		recording: {
			enabled: true,
			allowAccessTo: recordingAccess
		}
	});
	expect(response.status).toBe(200);
};

export const updateRoomStatus = async (roomId: string, status: MeetRoomStatus) => {
	checkAppIsRunning();

	return await request(app)
		.put(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/status`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.send({ status });
};

export const deleteRoom = async (roomId: string, query: Record<string, unknown> = {}) => {
	checkAppIsRunning();

	const result = await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.query(query);
	await sleep('1s');
	return result;
};

export const bulkDeleteRooms = async (roomIds: string[], withMeeting?: string, withRecordings?: string) => {
	checkAppIsRunning();

	const result = await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
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
 * Runs the expired rooms garbage collector.
 *
 * This function retrieves the RoomService from the dependency injection container
 * and calls its deleteExpiredRooms method to clean up expired rooms.
 * It then waits for 1 second before completing.
 */
export const runExpiredRoomsGC = async () => {
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

export const getRoomMemberRoles = async (roomId: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms/${roomId}/roles`)
		.send();
	return response;
};

export const getRoomMemberRoleBySecret = async (roomId: string, secret: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms/${roomId}/roles/${secret}`)
		.send();
	return response;
};

export const generateRoomMemberTokenRequest = async (roomId: string, tokenOptions: MeetRoomMemberTokenOptions) => {
	checkAppIsRunning();

	// Disable authentication to generate the token
	await changeSecurityConfig(AuthMode.NONE);

	// Generate the room member token
	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms/${roomId}/token`)
		.send(tokenOptions);
	return response;
};

/**
 * Generates a room member token for a room and returns the JWT token in the format "Bearer <token>"
 */
export const generateRoomMemberToken = async (
	roomId: string,
	tokenOptions: MeetRoomMemberTokenOptions
): Promise<string> => {
	const response = await generateRoomMemberTokenRequest(roomId, tokenOptions);
	expect(response.status).toBe(200);

	expect(response.body).toHaveProperty('token');
	return `Bearer ${response.body.token}`;
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
		MEET_ENV.LIVEKIT_API_KEY,
		'--api-secret',
		MEET_ENV.LIVEKIT_API_SECRET
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
export const updateParticipantMetadata = async (
	roomId: string,
	participantIdentity: string,
	metadata: MeetRoomMemberTokenMetadata
) => {
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
		MEET_ENV.LIVEKIT_API_KEY,
		'--api-secret',
		MEET_ENV.LIVEKIT_API_SECRET
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
	newRole: MeetRoomMemberRole,
	moderatorToken: string
) => {
	checkAppIsRunning();

	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings/${roomId}/participants/${participantIdentity}/role`)
		.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, moderatorToken)
		.send({ role: newRole });
	return response;
};

export const kickParticipant = async (roomId: string, participantIdentity: string, moderatorToken: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.delete(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings/${roomId}/participants/${participantIdentity}`)
		.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, moderatorToken)
		.send();
	return response;
};

export const endMeeting = async (roomId: string, moderatorToken: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.delete(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings/${roomId}`)
		.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, moderatorToken)
		.send();
	await sleep('1s');
	return response;
};

export const startRecording = async (roomId: string, moderatorToken: string) => {
	checkAppIsRunning();

	return await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings`)
		.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, moderatorToken)
		.send({ roomId });
};

export const stopRecording = async (recordingId: string, moderatorToken: string) => {
	checkAppIsRunning();

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/recordings/${recordingId}/stop`)
		.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, moderatorToken)
		.send();
	await sleep('2.5s');

	return response;
};

export const getRecording = async (recordingId: string) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
};

export const getRecordingMedia = async (recordingId: string, range?: string) => {
	checkAppIsRunning();

	const req = request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}/media`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);

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
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
};

export const deleteRecording = async (recordingId: string) => {
	checkAppIsRunning();

	return await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/${recordingId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
};

export const bulkDeleteRecordings = async (recordingIds: string[], roomMemberToken?: string): Promise<Response> => {
	checkAppIsRunning();

	const req = request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`)
		.query({ recordingIds: recordingIds.join(',') });

	if (roomMemberToken) {
		req.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMemberToken);
	} else {
		req.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
	}

	return await req;
};

export const downloadRecordings = async (
	recordingIds: string[],
	asBuffer = true,
	roomMemberToken?: string
): Promise<Response> => {
	checkAppIsRunning();

	const req = request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings/download`)
		.query({ recordingIds: recordingIds.join(',') });

	if (roomMemberToken) {
		req.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMemberToken);
	} else {
		req.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
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
			.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, moderatorToken)
			.send()
	);
	const results = await Promise.all(tasks);

	// Check responses
	results.forEach((response) => {
		expect(response.status).toBe(202);
	});
	await sleep('1s');
};

export const getAllRecordings = async (query: Record<string, unknown> = {}) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.query(query);
};

export const getAllRecordingsFromRoom = async (roomMemberToken: string) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`)
		.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMemberToken);
};

export const deleteAllRecordings = async () => {
	checkAppIsRunning();

	let nextPageToken: string | undefined;

	do {
		const response = await getAllRecordings({
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

export const getAnalytics = async () => {
	checkAppIsRunning();

	const accessToken = await loginUser();
	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/analytics`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send();

	return response;
};

// PRIVATE METHODS

const checkAppIsRunning = () => {
	if (!app) {
		throw new Error('App instance is not defined');
	}
};
