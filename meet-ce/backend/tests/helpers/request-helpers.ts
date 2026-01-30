import { expect } from '@jest/globals';
import {
	MeetAppearanceConfig,
	MeetRecordingInfo,
	MeetRecordingStatus,
	MeetRoom,
	MeetRoomAnonymousConfig,
	MeetRoomConfig,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomMemberOptions,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions,
	MeetRoomOptions,
	MeetRoomRolesConfig,
	MeetRoomStatus,
	MeetUserOptions,
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
import { RoomScheduledTasksService } from '../../src/services/room-scheduled-tasks.service.js';

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

// API KEY HELPERS

export const generateApiKey = async (): Promise<string> => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
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

	const { accessToken } = await loginRootAdmin();
	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/api-keys`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send();
	return response;
};

export const deleteApiKeys = async () => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
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

// GLOBAL CONFIG HELPERS

export const getRoomsAppearanceConfig = async () => {
	checkAppIsRunning();

	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/rooms/appearance`)
		.send();
	return response;
};

export const updateRoomsAppearanceConfig = async (config: { appearance: MeetAppearanceConfig }) => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/rooms/appearance`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send(config);
	return response;
};

export const getWebbhookConfig = async () => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
	const response = await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/webhooks`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send();
	return response;
};

export const updateWebbhookConfig = async (config: WebhookConfig) => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
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

	const { accessToken } = await loginRootAdmin();
	const response = await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config/security`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send(config);
	return response;
};

export const restoreDefaultGlobalConfig = async () => {
	const configService = container.get(GlobalConfigService);
	const defaultGlobalConfig = configService['getDefaultConfig']();
	await configService['saveGlobalConfig'](defaultGlobalConfig);
};

// AUTH HELPERS

/**
 * Logs in a user and returns the access and refresh (if available) tokens in the format "Bearer <token>"
 */
export const loginUser = async (
	userId: string,
	password: string
): Promise<{ accessToken: string; refreshToken?: string }> => {
	checkAppIsRunning();

	const response = await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth/login`)
		.send({
			userId,
			password
		})
		.expect(200);

	expect(response.body).toHaveProperty('accessToken');
	const accessToken = `Bearer ${response.body.accessToken}`;
	const refreshToken = response.body.refreshToken ? `Bearer ${response.body.refreshToken}` : undefined;
	return { accessToken, refreshToken };
};

/**
 * Logs in the root admin user and returns the access an refresh tokens in the format "Bearer <token>"
 */
export const loginRootAdmin = async (): Promise<{ accessToken: string; refreshToken: string }> => {
	const { accessToken, refreshToken } = await loginUser(MEET_ENV.INITIAL_ADMIN_USER, MEET_ENV.INITIAL_ADMIN_PASSWORD);
	return { accessToken, refreshToken: refreshToken! };
};

// USER HELPERS

export const createUser = async (options: MeetUserOptions) => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
	return await request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send(options);
};

export const getUsers = async (query: Record<string, unknown> = {}) => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
	return await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.query(query);
};

export const getUser = async (userId: string) => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
	return await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users/${userId}`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send();
};

export const getMe = async (accessToken: string) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users/me`)
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

/**
 * Changes the password for the authenticated user after first login
 * and returns the access and refresh tokens in the format "Bearer <token>"
 */
export const changePasswordAfterFirstLogin = async (
	currentPassword: string,
	newPassword: string,
	accessTokenTmp: string
): Promise<{ accessToken: string; refreshToken: string }> => {
	const response = await changePassword(currentPassword, newPassword, accessTokenTmp);
	expect(response.status).toBe(200);

	expect(response.body).toHaveProperty('accessToken');
	expect(response.body).toHaveProperty('refreshToken');
	const accessToken = `Bearer ${response.body.accessToken}`;
	const refreshToken = `Bearer ${response.body.refreshToken}`;
	return { accessToken, refreshToken };
};

export const resetUserPassword = async (userId: string, newPassword: string) => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
	return await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users/${userId}/password`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send({ newPassword });
};

export const updateUserRole = async (userId: string, role: string) => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
	return await request(app)
		.put(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users/${userId}/role`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send({ role });
};

export const deleteUser = async (userId: string) => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
	return await request(app)
		.delete(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users/${userId}`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.send();
};

export const bulkDeleteUsers = async (userIds: string[]) => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
	return await request(app)
		.delete(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users`)
		.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken)
		.query({ userIds: userIds.join(',') });
};

export const deleteAllUsers = async () => {
	checkAppIsRunning();

	let nextPageToken: string | undefined;

	do {
		const response = await getUsers({ fields: 'userId', maxItems: 100, nextPageToken });
		expect(response.status).toBe(200);

		nextPageToken = response.body.pagination?.nextPageToken ?? undefined;
		const userIds = response.body.users
			.map((user: { userId: string }) => user.userId)
			.filter((userId: string) => userId !== MEET_ENV.INITIAL_ADMIN_USER);

		if (userIds.length === 0) {
			break;
		}

		await bulkDeleteUsers(userIds);
	} while (nextPageToken);
};

// ROOM HELPERS

export const createRoom = async (options: MeetRoomOptions = {}, accessToken?: string): Promise<MeetRoom> => {
	checkAppIsRunning();

	const req = request(app).post(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`).send(options).expect(201);

	if (accessToken) {
		req.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken);
	} else {
		req.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
	}

	const response = await req;
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

export const updateRoomStatus = async (roomId: string, status: MeetRoomStatus) => {
	checkAppIsRunning();

	return await request(app)
		.put(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/status`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.send({ status });
};

export const updateRoomRoles = async (roomId: string, rolesConfig: MeetRoomRolesConfig) => {
	checkAppIsRunning();

	return await request(app)
		.put(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/roles`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.send({ rolesConfig });
};

export const updateRoomAnonymousConfig = async (roomId: string, anonymousConfig: MeetRoomAnonymousConfig) => {
	checkAppIsRunning();

	return await request(app)
		.put(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/anonymous`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.send({ anonymousConfig });
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
 * This function retrieves the RoomScheduledTasksService from the dependency injection container
 * and calls its deleteExpiredRooms method to clean up expired rooms.
 * It then waits for 1 second before completing.
 */
export const runExpiredRoomsGC = async () => {
	checkAppIsRunning();

	const roomTaskScheduler = container.get(RoomScheduledTasksService);
	await roomTaskScheduler['deleteExpiredRooms']();
	await sleep('1s');
};

/**
 * Runs the inconsistent rooms garbage collector.
 *
 * This function retrieves the RoomScheduledTasksService from the dependency injection container
 * and calls its validateRoomsStatusGC method to clean up inconsistent rooms.
 * It then waits for 1 second before completing.
 */
export const executeRoomStatusValidationGC = async () => {
	checkAppIsRunning();

	const roomTaskScheduler = container.get(RoomScheduledTasksService);
	await roomTaskScheduler['validateRoomsStatusGC']();
	await sleep('1s');
};

// ROOM MEMBER HELPERS

export const createRoomMember = async (roomId: string, memberOptions: MeetRoomMemberOptions) => {
	checkAppIsRunning();

	return await request(app)
		.post(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/members`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.send(memberOptions);
};

export const getRoomMembers = async (roomId: string, query: Record<string, unknown> = {}) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/members`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.query(query);
};

export const getRoomMember = async (roomId: string, memberId: string) => {
	checkAppIsRunning();

	return await request(app)
		.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/members/${memberId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
};

export const updateRoomMember = async (roomId: string, memberId: string, updates: Record<string, unknown>) => {
	checkAppIsRunning();

	return await request(app)
		.put(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/members/${memberId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.send(updates);
};

export const deleteRoomMember = async (roomId: string, memberId: string) => {
	checkAppIsRunning();

	return await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/members/${memberId}`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.send();
};

export const bulkDeleteRoomMembers = async (roomId: string, memberIds: string[]) => {
	checkAppIsRunning();

	return await request(app)
		.delete(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/members`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.query({ memberIds: memberIds.join(',') });
};

export const generateRoomMemberTokenRequest = async (
	roomId: string,
	tokenOptions: MeetRoomMemberTokenOptions,
	accessToken?: string
) => {
	checkAppIsRunning();

	const req = request(app)
		.post(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms/${roomId}/members/token`)
		.send(tokenOptions);

	if (accessToken) {
		req.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessToken);
	}

	return await req;
};

/**
 * Generates a room member token for a room and returns the JWT token in the format "Bearer <token>"
 */
export const generateRoomMemberToken = async (
	roomId: string,
	tokenOptions: MeetRoomMemberTokenOptions,
	accessToken?: string
): Promise<string> => {
	const response = await generateRoomMemberTokenRequest(roomId, tokenOptions, accessToken);
	expect(response.status).toBe(200);

	expect(response.body).toHaveProperty('token');
	return `Bearer ${response.body.token}`;
};

// MEETING HELPERS

/**
 * Adds a fake participant to a LiveKit room for testing purposes.
 *
 * @param roomId The ID of the room to join
 * @param participantIdentity The identity for the fake participant
 */
export const joinFakeParticipant = async (roomId: string, participantIdentity: string) => {
	await ensureLivekitCliInstalled();
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

// RECORDING HELPERS

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

/**
 * Retrieves the access secret for a specific recording by parsing the recording URL.
 *
 * @param recordingId - The unique identifier of the recording
 * @param privateAccess - Whether to request a private access URL
 * @returns A Promise that resolves to the access secret string
 */
export const getRecordingAccessSecret = async (recordingId: string, privateAccess = false): Promise<string> => {
	const response = await getRecordingUrl(recordingId, privateAccess);
	expect(response.status).toBe(200);
	const recordingUrl = response.body.url;
	expect(recordingUrl).toBeDefined();

	// Parse the URL to extract the secret from the query parameters
	const parsedUrl = new URL(recordingUrl);
	const secret = parsedUrl.searchParams.get('secret');
	return secret!;
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

export const runReleaseActiveRecordingLock = async (roomId: string) => {
	checkAppIsRunning();

	const recordingService = container.get(RecordingService);
	await recordingService.releaseRecordingLockIfNoEgress(roomId);
};

// ANALYTICS HELPERS

export const getAnalytics = async () => {
	checkAppIsRunning();

	const { accessToken } = await loginRootAdmin();
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
