import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { setInternalConfig } from '../../../../src/config/internal-config.js';
import { errorRoomNotFound } from '../../../../src/models/error.model.js';
import { MeetRoom } from '../../../../src/typings/ce/index.js';
import {
	expectValidationError,
	expectValidRecordingLocationHeader,
	expectValidStartRecordingResponse,
	expectValidStopRecordingResponse
} from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	joinFakeParticipant,
	startRecording,
	startTestServer,
	stopAllRecordings,
	stopRecording
} from '../../../helpers/request-helpers.js';
import { setupMultiRoomTestContext, TestContext } from '../../../helpers/test-scenarios.js';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetStorageService } from '../../../../src/services/index.js';

describe('Recording API Tests', () => {
	let context: TestContext | null = null;
	let room: MeetRoom, moderatorCookie: string;

	beforeAll(async () => {
		startTestServer();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	afterAll(async () => {
		await stopAllRecordings(moderatorCookie);
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	describe('Start Recording Tests', () => {
		beforeAll(async () => {
			// Create a room and join a participant
			context = await setupMultiRoomTestContext(1, true);
			({ room, moderatorCookie } = context.getRoomByIndex(0)!);
		});

		afterAll(async () => {
			await disconnectFakeParticipants();
			await deleteAllRooms();
			await deleteAllRecordings();
			context = null;
		});

		it('should return 201 with proper response and location header when recording starts successfully', async () => {
			const response = await startRecording(room.roomId, moderatorCookie);
			const recordingId = response.body.recordingId;
			expectValidStartRecordingResponse(response, room.roomId);

			expectValidRecordingLocationHeader(response);
			const stopResponse = await stopRecording(recordingId, moderatorCookie);
			expectValidStopRecordingResponse(stopResponse, recordingId, room.roomId);
		});

		it('should secrets and archived room files be created when recording starts', async () => {
			const response = await startRecording(room.roomId, moderatorCookie);
			const recordingId = response.body.recordingId;
			expectValidStartRecordingResponse(response, room.roomId);

			expectValidRecordingLocationHeader(response);

			const storageService = container.get(MeetStorageService);

			const recSecrets = await storageService.getAccessRecordingSecrets(recordingId);
			expect(recSecrets).toBeDefined();
			expect(recSecrets?.publicAccessSecret).toBeDefined();
			expect(recSecrets?.privateAccessSecret).toBeDefined();

			const archivedRoom = await storageService.getArchivedRoomMetadata(room.roomId);
			expect(archivedRoom).toBeDefined();
			expect(archivedRoom?.moderatorRoomUrl).toBeDefined();
			expect(archivedRoom?.publisherRoomUrl).toBeDefined();
			expect(archivedRoom?.preferences).toBeDefined();

			// Check if secrets file is created
			const secretsResponse = await stopRecording(recordingId, moderatorCookie);
			expectValidStopRecordingResponse(secretsResponse, recordingId, room.roomId);
		});

		it('should successfully start recording, stop it, and start again (sequential operations)', async () => {
			const firstStartResponse = await startRecording(room.roomId, moderatorCookie);
			const firstRecordingId = firstStartResponse.body.recordingId;

			expectValidStartRecordingResponse(firstStartResponse, room.roomId);

			const firstStopResponse = await stopRecording(firstRecordingId, moderatorCookie);
			expectValidStopRecordingResponse(firstStopResponse, firstRecordingId, room.roomId);

			const secondStartResponse = await startRecording(room.roomId, moderatorCookie);
			expectValidStartRecordingResponse(secondStartResponse, room.roomId);
			const secondRecordingId = secondStartResponse.body.recordingId;

			const secondStopResponse = await stopRecording(secondRecordingId, moderatorCookie);
			expectValidStopRecordingResponse(secondStopResponse, secondRecordingId, room.roomId);
		});

		it('should handle simultaneous recordings in different rooms correctly', async () => {
			const context = await setupMultiRoomTestContext(2, true);

			const roomDataA = context.getRoomByIndex(0)!;
			const roomDataB = context.getRoomByIndex(1)!;

			const firstResponse = await startRecording(roomDataA.room.roomId, roomDataA.moderatorCookie);
			const secondResponse = await startRecording(roomDataB.room.roomId, roomDataB.moderatorCookie);

			expectValidStartRecordingResponse(firstResponse, roomDataA.room.roomId);
			expectValidStartRecordingResponse(secondResponse, roomDataB.room.roomId);

			const firstRecordingId = firstResponse.body.recordingId;
			const secondRecordingId = secondResponse.body.recordingId;

			const [firstStopResponse, secondStopResponse] = await Promise.all([
				stopRecording(firstRecordingId, roomDataA.moderatorCookie),
				stopRecording(secondRecordingId, roomDataB.moderatorCookie)
			]);
			expectValidStopRecordingResponse(firstStopResponse, firstRecordingId, roomDataA.room.roomId);
			expectValidStopRecordingResponse(secondStopResponse, secondRecordingId, roomDataB.room.roomId);
		});
	});

	describe('Start Recording Validation failures', () => {
		beforeAll(async () => {
			// Create a room without participants
			context = await setupMultiRoomTestContext(1, false);
			({ room, moderatorCookie } = context.getRoomByIndex(0)!);
		});

		afterEach(async () => {
			await disconnectFakeParticipants();
			await stopAllRecordings(moderatorCookie);
		});

		it('should accept valid roomId but reject with 409', async () => {
			const response = await startRecording(room.roomId, moderatorCookie);
			// Room exists but it has no participants
			expect(response.status).toBe(409);
			expect(response.body.message).toContain(`Room '${room.roomId}' has no participants`);
		});

		it('should sanitize roomId and reject the request with 409 due to no participants', async () => {
			const malformedRoomId = '  .<!?' + room.roomId + '  ';
			const response = await startRecording(malformedRoomId, moderatorCookie);

			console.log('Response:', response.body);
			expect(response.status).toBe(409);
			expect(response.body.message).toContain(`Room '${room.roomId}' has no participants`);
		});

		it('should reject request with roomId that becomes empty after sanitization', async () => {
			const response = await startRecording('!@#$%^&*()', moderatorCookie);

			expectValidationError(response, 'roomId', 'cannot be empty after sanitization');
		});

		it('should reject request with non-string roomId', async () => {
			const response = await startRecording(123 as unknown as string, moderatorCookie);
			expectValidationError(response, 'roomId', 'Expected string');
		});

		it('should reject request with very long roomId', async () => {
			const longRoomId = 'a'.repeat(101);
			const response = await startRecording(longRoomId, moderatorCookie);

			expectValidationError(response, 'roomId', 'cannot exceed 100 characters');
		});

		it('should handle room that does not exist', async () => {
			const response = await startRecording('non-existing-room-id', moderatorCookie);
			const error = errorRoomNotFound('non-existing-room-id');
			expect(response.status).toBe(404);
			expect(response.body).toEqual({
				error: error.name,
				message: error.message
			});
		});

		it('should return 409 when recording is already in progress', async () => {
			await joinFakeParticipant(room.roomId, 'fakeParticipantId');
			const firstResponse = await startRecording(room.roomId, moderatorCookie);
			const recordingId = firstResponse.body.recordingId;
			expectValidStartRecordingResponse(firstResponse, room.roomId);

			const secondResponse = await startRecording(room!.roomId, moderatorCookie);
			expect(secondResponse.status).toBe(409);
			expect(secondResponse.body.message).toContain('already');
			const stopResponse = await stopRecording(recordingId, moderatorCookie);
			expectValidStopRecordingResponse(stopResponse, recordingId, room.roomId);
		});

		it('should return 503 when recording start times out', async () => {
			setInternalConfig({
				RECORDING_STARTED_TIMEOUT: '1s'
			});
			await joinFakeParticipant(room.roomId, 'fakeParticipantId');
			const response = await startRecording(room.roomId, moderatorCookie);
			expect(response.status).toBe(503);
			expect(response.body.message).toContain('timed out while starting');
			setInternalConfig({
				RECORDING_STARTED_TIMEOUT: '30s'
			});
		});
	});
});
