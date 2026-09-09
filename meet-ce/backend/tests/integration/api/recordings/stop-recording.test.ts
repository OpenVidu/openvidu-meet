import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRecordingStatus, MeetRoom } from '@openvidu-meet/typings';
import {
	expectErrorResponse,
	expectValidRecordingLocationHeader,
	expectValidRecordingWithFields,
	expectValidStopRecordingResponse
} from '../../../helpers/assertion-helpers.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	startRecording,
	startRecordingAndWaitUntilActive,
	startTestServer,
	stopAllRecordings,
	stopRecording
} from '../../../helpers/request-helpers.js';

import { setupMultiRoomTestContext } from '../../../helpers/test-scenarios.js';
import { waitForRecordingStatus } from '../../../helpers/wait-helpers.js';
import { TestContext } from '../../../interfaces/scenarios.js';

describe('Recording API Tests', () => {
	let context: TestContext | null = null;
	let room: MeetRoom;

	beforeAll(async () => {
		await startTestServer();
		await deleteAllRecordings();
	});

	afterAll(async () => {
		await stopAllRecordings();
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
	});

	describe('Stop Recording Tests', () => {
		let recordingId: string;
		beforeAll(async () => {
			// Create a room and join a participant
			context = await setupMultiRoomTestContext(1, true);
			({ room } = context.getRoomByIndex(0)!);
			const response = await startRecordingAndWaitUntilActive(room.roomId);
			recordingId = response.body.recordingId;
		});

		it('should stop an active recording and return 202', async () => {
			const response = await stopRecording(recordingId);
			expectValidStopRecordingResponse(response, recordingId, room.roomId, room.roomName);
		});

		it('should stop multiple recordings in parallel', async () => {
			const context = await setupMultiRoomTestContext(2, true);
			const roomDataA = context.getRoomByIndex(0);
			const roomDataB = context.getRoomByIndex(1);
			const responseA = await startRecordingAndWaitUntilActive(roomDataA!.room.roomId);
			const responseB = await startRecordingAndWaitUntilActive(roomDataB!.room.roomId);
			const recordingIdA = responseA.body.recordingId;
			const recordingIdB = responseB.body.recordingId;
			const stopResponseA = await stopRecording(recordingIdA);
			expectValidStopRecordingResponse(
				stopResponseA,
				recordingIdA,
				roomDataA!.room.roomId,
				roomDataA!.room.roomName
			);
			const stopResponseB = await stopRecording(recordingIdB);
			expectValidStopRecordingResponse(
				stopResponseB,
				recordingIdB,
				roomDataB!.room.roomId,
				roomDataB!.room.roomName
			);
		});

		it('should stop a recording still waiting for its first track, leaving it aborted', async () => {
			const context = await setupMultiRoomTestContext(1, true);
			const { room } = context.getRoomByIndex(0)!;
			const startResponse = await startRecording(room.roomId);
			expect(startResponse.body.status).toBe(MeetRecordingStatus.STARTING);
			const recordingId = startResponse.body.recordingId;

			const response = await stopRecording(recordingId);

			expect(response.status).toBe(202);
			expectValidRecordingLocationHeader(response);
			expect(response.body).toHaveProperty('recordingId', recordingId);
			expect([MeetRecordingStatus.ENDING, MeetRecordingStatus.ABORTED]).toContain(response.body.status);
			expect(response.body).not.toHaveProperty('startDate');

			const abortedRecording = await waitForRecordingStatus(recordingId, MeetRecordingStatus.ABORTED);
			expect(abortedRecording).not.toHaveProperty('startDate');
		});

		describe('Stop Recording Validation failures', () => {
			it('should return 404 when recordingId does not exist', async () => {
				const response = await stopRecording(`${room.roomId}--EG_123--444`);
				expect(response.status).toBe(404);
				expect(response.body.error).toBe('Recording Error');
				expect(response.body.message).toContain('not found');
			});

			it('should return 409 when recording is already stopped', async () => {
				// First stop the recording
				await stopRecording(recordingId);

				// Try to stop it again
				const response = await stopRecording(recordingId);

				expectErrorResponse(response, 409, 'Recording Error', `Recording '${recordingId}' is already stopped`);
			});

			it('should return 404 when recordingId is not in the correct format', async () => {
				const response = await stopRecording('invalid-recording-id');
				expect(response.status).toBe(422);
				expect(response.body.error).toBe('Unprocessable Entity');
				expect(response.body.message).toContain('Invalid request');
				expect(response.body.details).toStrictEqual([
					{
						field: 'params.recordingId',
						message: 'recordingId does not follow the expected format'
					}
				]);
			});
		});
	});

	describe('POST /recordings/:recordingId/stop - X-Fields header and fields query param', () => {
		let recordingId: string;
		beforeAll(async () => {
			// Create a room and join a participant
			context = await setupMultiRoomTestContext(1, true);
			({ room } = context.getRoomByIndex(0)!);
			const response = await startRecordingAndWaitUntilActive(room.roomId);
			recordingId = response.body.recordingId;
		});

		it('should filter response fields using X-Fields header on stop recording', async () => {
			const response = await stopRecording(recordingId, {
				headers: { xFields: 'recordingId,status' }
			});

			expect(response.status).toBe(202);
			expectValidRecordingLocationHeader(response);
			expectValidRecordingWithFields(response.body, ['recordingId', 'status']);
		});
	});
});
