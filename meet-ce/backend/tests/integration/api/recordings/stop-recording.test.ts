import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoom } from '@openvidu-meet/typings';
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
import { setupMultiRoomTestContext } from '../../../helpers/test-scenarios';
import { TestContext } from '../../../interfaces/scenarios';

describe('Recording API Tests', () => {
	let context: TestContext | null = null;
	let room: MeetRoom, moderatorToken: string;

	beforeAll(async () => {
		await startTestServer();
		await deleteAllRecordings();
	});

	afterAll(async () => {
		await stopAllRecordings(moderatorToken);
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	describe('Stop Recording Tests', () => {
		let recordingId: string;
		beforeAll(async () => {
			// Create a room and join a participant
			context = await setupMultiRoomTestContext(1, true);
			({ room, moderatorToken } = context.getRoomByIndex(0)!);
			const response = await startRecording(room.roomId, moderatorToken);
			recordingId = response.body.recordingId;
		});

		it('should stop an active recording and return 202', async () => {
			const response = await stopRecording(recordingId, moderatorToken);
			expectValidStopRecordingResponse(response, recordingId, room.roomId, room.roomName);
		});

		it('should stop multiple recordings in parallel', async () => {
			const context = await setupMultiRoomTestContext(2, true);
			const roomDataA = context.getRoomByIndex(0);
			const roomDataB = context.getRoomByIndex(1);
			const responseA = await startRecording(roomDataA!.room.roomId, roomDataA!.moderatorToken);
			const responseB = await startRecording(roomDataB!.room.roomId, roomDataB!.moderatorToken);
			const recordingIdA = responseA.body.recordingId;
			const recordingIdB = responseB.body.recordingId;
			const stopResponseA = await stopRecording(recordingIdA, roomDataA!.moderatorToken);
			expectValidStopRecordingResponse(
				stopResponseA,
				recordingIdA,
				roomDataA!.room.roomId,
				roomDataA!.room.roomName
			);
			const stopResponseB = await stopRecording(recordingIdB, roomDataB!.moderatorToken);
			expectValidStopRecordingResponse(
				stopResponseB,
				recordingIdB,
				roomDataB!.room.roomId,
				roomDataB!.room.roomName
			);
		});

		describe('Stop Recording Validation failures', () => {
			it('should return 404 when recordingId does not exist', async () => {
				const response = await stopRecording(`${room.roomId}--EG_123--444`, moderatorToken);
				expect(response.status).toBe(404);
				expect(response.body.error).toBe('Recording Error');
				expect(response.body.message).toContain('not found');
			});

			it('should return 400 when recording is already stopped', async () => {
				// First stop the recording
				await stopRecording(recordingId, moderatorToken);

				// Try to stop it again
				const response = await stopRecording(recordingId, moderatorToken);

				console.log('Response:', response.body);
				expectErrorResponse(response, 409, '', `Recording '${recordingId}' is already stopped`);
			});

			it('should return 404 when recordingId is not in the correct format', async () => {
				const response = await stopRecording('invalid-recording-id', moderatorToken);
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
