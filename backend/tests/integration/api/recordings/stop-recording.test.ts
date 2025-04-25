import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { expectValidStopRecordingResponse, expectErrorResponse } from '../../../utils/assertion-helpers';
import {
	startRecording,
	disconnectFakeParticipants,
	stopAllRecordings,
	stopRecording,
	deleteAllRecordings,
	deleteAllRooms,
	startTestServer
} from '../../../utils/helpers';
import { MeetRoom } from '../../../../src/typings/ce';
import { setupMultiRoomTestContext, TestContext } from '../../../utils/test-scenarios';

describe('Recording API Tests', () => {
	let context: TestContext | null = null;
	let room: MeetRoom, moderatorCookie: string;

	beforeAll(async () => {
		startTestServer();
	});
	afterAll(async () => {
		await stopAllRecordings(moderatorCookie);
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
	});

	describe('Stop Recording Tests', () => {
		let recordingId: string;
		beforeAll(async () => {
			// Create a room and join a participant
			context = await setupMultiRoomTestContext(1, true);
			({ room, moderatorCookie } = context.getRoomByIndex(0)!);
			const response = await startRecording(room.roomId, moderatorCookie);
			recordingId = response.body.recordingId;
		});

		afterAll(async () => {
			await disconnectFakeParticipants();
			await stopAllRecordings(moderatorCookie);
			await deleteAllRooms();
			await deleteAllRecordings();
			context = null;
		});

		it('should stop an active recording and return 202', async () => {
			const response = await stopRecording(recordingId, moderatorCookie);
			expectValidStopRecordingResponse(response, recordingId, room.roomId);
		});

		it('should stop multiple recordings in parallel', async () => {
			const context = await setupMultiRoomTestContext(2, true);
			const roomDataA = context.getRoomByIndex(0);
			const roomDataB = context.getRoomByIndex(1);
			const responseA = await startRecording(roomDataA!.room.roomId, roomDataA?.moderatorCookie);
			const responseB = await startRecording(roomDataB!.room.roomId, roomDataB?.moderatorCookie);
			const recordingIdA = responseA.body.recordingId;
			const recordingIdB = responseB.body.recordingId;
			const stopResponseA = await stopRecording(recordingIdA, roomDataA?.moderatorCookie);
			expectValidStopRecordingResponse(stopResponseA, recordingIdA, roomDataA!.room.roomId);
			const stopResponseB = await stopRecording(recordingIdB, roomDataB?.moderatorCookie);
			expectValidStopRecordingResponse(stopResponseB, recordingIdB, roomDataB!.room.roomId);
		});

		describe('Stop Recording Validation failures', () => {
			it('should return 404 when recordingId does not exist', async () => {
				const response = await stopRecording(`${room.roomId}--EG_123--444`, moderatorCookie);
				expect(response.status).toBe(404);
				expect(response.body.name).toBe('Recording Error');
				expect(response.body.message).toContain('not found');
			});

			it('should return 400 when recording is already stopped', async () => {
				// First stop the recording
				await stopRecording(recordingId, moderatorCookie);

				// Try to stop it again
				const response = await stopRecording(recordingId, moderatorCookie);

				console.log('Response:', response.body);
				expectErrorResponse(response, 409, '', `Recording '${recordingId}' is already stopped`);
			});

			it('should return 404 when recordingId is not in the correct format', async () => {
				const response = await stopRecording('invalid-recording-id', moderatorCookie);
				expect(response.status).toBe(422);
				expect(response.body.error).toBe('Unprocessable Entity');
				expect(response.body.message).toContain('Invalid request');
				expect(response.body.details).toStrictEqual([
					{
						field: 'recordingId',
						message: 'recordingId does not follow the expected format'
					}
				]);
			});
		});
	});
});
