import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoom } from '../../../../src/typings/ce';
import { expectErrorResponse, expectValidStopRecordingResponse } from '../../../helpers/assertion-helpers';
import {
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	startRecording,
	startTestServer,
	stopAllRecordings,
	stopRecording
} from '../../../helpers/request-helpers';
import { setupMultiRoomTestContext, TestContext } from '../../../helpers/test-scenarios';

describe('Recording API Tests', () => {
	let context: TestContext | null = null;
	let room: MeetRoom, moderatorCookie: string;

	beforeAll(async () => {
		startTestServer();
		await deleteAllRecordings();
	});

	afterAll(async () => {
		await stopAllRecordings(moderatorCookie);
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
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
				expect(response.body.error).toBe('Recording Error');
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
