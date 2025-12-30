import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoom } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { setInternalConfig } from '../../../../src/config/internal-config.js';
import { errorRoomNotFound } from '../../../../src/models/error.model.js';
import { RecordingRepository } from '../../../../src/repositories/recording.repository.js';
import {
	expectValidationError,
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
import { setupMultiRoomTestContext } from '../../../helpers/test-scenarios.js';
import { TestContext } from '../../../interfaces/scenarios.js';

describe('Recording API Tests', () => {
	let context: TestContext | null = null;
	let room: MeetRoom, moderatorToken: string;

	beforeAll(async () => {
		await startTestServer();
		await deleteAllRecordings();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	describe('Start Recording Tests', () => {
		beforeAll(async () => {
			// Create a room and join a participant
			context = await setupMultiRoomTestContext(1, true);
			({ room, moderatorToken } = context.getRoomByIndex(0)!);
		});

		afterAll(async () => {
			await disconnectFakeParticipants();
			await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
			context = null;
		});

		it('should return 201 with proper response and location header when recording starts successfully', async () => {
			const response = await startRecording(room.roomId, moderatorToken);
			const recordingId = response.body.recordingId;
			expectValidStartRecordingResponse(response, room.roomId, room.roomName);

			const stopResponse = await stopRecording(recordingId, moderatorToken);
			expectValidStopRecordingResponse(stopResponse, recordingId, room.roomId, room.roomName);
		});

		it('should create secrets when recording starts', async () => {
			const response = await startRecording(room.roomId, moderatorToken);
			const recordingId = response.body.recordingId;
			expectValidStartRecordingResponse(response, room.roomId, room.roomName);

			const recordingRepository = container.get(RecordingRepository);

			const recSecrets = await recordingRepository.findAccessSecretsByRecordingId(recordingId);
			expect(recSecrets).toBeDefined();
			expect(recSecrets?.publicAccessSecret).toBeDefined();
			expect(recSecrets?.privateAccessSecret).toBeDefined();

			const stopResponse = await stopRecording(recordingId, moderatorToken);
			expectValidStopRecordingResponse(stopResponse, recordingId, room.roomId, room.roomName);
		});

		it('should successfully start recording, stop it, and start again (sequential operations)', async () => {
			const firstStartResponse = await startRecording(room.roomId, moderatorToken);
			const firstRecordingId = firstStartResponse.body.recordingId;

			expectValidStartRecordingResponse(firstStartResponse, room.roomId, room.roomName);

			const firstStopResponse = await stopRecording(firstRecordingId, moderatorToken);
			expectValidStopRecordingResponse(firstStopResponse, firstRecordingId, room.roomId, room.roomName);

			const secondStartResponse = await startRecording(room.roomId, moderatorToken);
			expectValidStartRecordingResponse(secondStartResponse, room.roomId, room.roomName);
			const secondRecordingId = secondStartResponse.body.recordingId;

			const secondStopResponse = await stopRecording(secondRecordingId, moderatorToken);
			expectValidStopRecordingResponse(secondStopResponse, secondRecordingId, room.roomId, room.roomName);
		});

		it('should handle simultaneous recordings in different rooms correctly', async () => {
			const context = await setupMultiRoomTestContext(2, true);

			const roomDataA = context.getRoomByIndex(0)!;
			const roomDataB = context.getRoomByIndex(1)!;

			const firstResponse = await startRecording(roomDataA.room.roomId, roomDataA.moderatorToken);
			const secondResponse = await startRecording(roomDataB.room.roomId, roomDataB.moderatorToken);

			expectValidStartRecordingResponse(firstResponse, roomDataA.room.roomId, roomDataA.room.roomName);
			expectValidStartRecordingResponse(secondResponse, roomDataB.room.roomId, roomDataB.room.roomName);

			const firstRecordingId = firstResponse.body.recordingId;
			const secondRecordingId = secondResponse.body.recordingId;

			const [firstStopResponse, secondStopResponse] = await Promise.all([
				stopRecording(firstRecordingId, roomDataA.moderatorToken),
				stopRecording(secondRecordingId, roomDataB.moderatorToken)
			]);
			expectValidStopRecordingResponse(
				firstStopResponse,
				firstRecordingId,
				roomDataA.room.roomId,
				roomDataA.room.roomName
			);
			expectValidStopRecordingResponse(
				secondStopResponse,
				secondRecordingId,
				roomDataB.room.roomId,
				roomDataB.room.roomName
			);
		});
	});

	describe('Start Recording Validation failures', () => {
		beforeAll(async () => {
			// Create a room without participants
			context = await setupMultiRoomTestContext(1, false);
			({ room, moderatorToken } = context.getRoomByIndex(0)!);
		});

		afterEach(async () => {
			await disconnectFakeParticipants();
			await stopAllRecordings(moderatorToken);
		});

		it('should accept valid roomId but reject with 409', async () => {
			const response = await startRecording(room.roomId, moderatorToken);
			// Room exists but it has no participants
			expect(response.status).toBe(409);
			expect(response.body.message).toContain(`Room '${room.roomId}' has no participants`);
		});

		it('should sanitize roomId and reject the request with 409 due to no participants', async () => {
			const malformedRoomId = '  .<!?' + room.roomId + '  ';
			const response = await startRecording(malformedRoomId, moderatorToken);

			console.log('Response:', response.body);
			expect(response.status).toBe(409);
			expect(response.body.message).toContain(`Room '${room.roomId}' has no participants`);
		});

		it('should reject request with roomId that becomes empty after sanitization', async () => {
			const response = await startRecording('!@#$%^&*()', moderatorToken);

			expectValidationError(response, 'roomId', 'cannot be empty after sanitization');
		});

		it('should reject request with non-string roomId', async () => {
			const response = await startRecording(123 as unknown as string, moderatorToken);
			expectValidationError(response, 'roomId', 'Expected string');
		});

		it('should reject request with very long roomId', async () => {
			const longRoomId = 'a'.repeat(101);
			const response = await startRecording(longRoomId, moderatorToken);

			expectValidationError(response, 'roomId', 'cannot exceed 100 characters');
		});

		it('should handle room that does not exist', async () => {
			const response = await startRecording('non-existing-room-id', moderatorToken);
			const error = errorRoomNotFound('non-existing-room-id');
			expect(response.status).toBe(404);
			expect(response.body).toEqual({
				error: error.name,
				message: error.message
			});
		});

		it('should return 409 when recording is already in progress', async () => {
			await joinFakeParticipant(room.roomId, 'fakeParticipantId');
			const firstResponse = await startRecording(room.roomId, moderatorToken);
			const recordingId = firstResponse.body.recordingId;
			expectValidStartRecordingResponse(firstResponse, room.roomId, room.roomName);

			const secondResponse = await startRecording(room!.roomId, moderatorToken);
			expect(secondResponse.status).toBe(409);
			expect(secondResponse.body.message).toContain('already');
			const stopResponse = await stopRecording(recordingId, moderatorToken);
			expectValidStopRecordingResponse(stopResponse, recordingId, room.roomId, room.roomName);
		});

		it('should return 503 when recording start times out', async () => {
			setInternalConfig({
				RECORDING_STARTED_TIMEOUT: '1s'
			});
			await joinFakeParticipant(room.roomId, 'fakeParticipantId');
			const response = await startRecording(room.roomId, moderatorToken);
			expect(response.status).toBe(503);
			expect(response.body.message).toContain('timed out while starting');
			setInternalConfig({
				RECORDING_STARTED_TIMEOUT: '30s'
			});
		});
	});
});
