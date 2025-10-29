import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { MeetRoom } from '@openvidu-meet/typings';
import { expectValidationError } from '../../../helpers/assertion-helpers';
import {
	deleteAllRecordings,
	deleteAllRooms,
	deleteRecording,
	disconnectFakeParticipants,
	startTestServer,
	stopAllRecordings,
	stopRecording
} from '../../../helpers/request-helpers';
import { setupMultiRecordingsTestContext } from '../../../helpers/test-scenarios';

describe('Recording API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
		await deleteAllRecordings();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	describe('Delete Recording Tests', () => {
		let recordingId: string, moderatorToken: string;

		beforeEach(async () => {
			const testContext = await setupMultiRecordingsTestContext(1, 1, 1);
			const roomData = testContext.getRoomByIndex(0)!;

			({ recordingId = '', moderatorToken } = roomData);
		});

		afterAll(async () => {
			await stopAllRecordings(moderatorToken);
			await Promise.all([deleteAllRecordings(), deleteAllRooms()]);
		});

		it('should delete a recording successfully', async () => {
			// Delete the recording
			const deleteResponse = await deleteRecording(recordingId);
			expect(deleteResponse.status).toBe(200);

			// Verify that the recording is deleted
			const getResponse = await deleteRecording(recordingId);
			expect(getResponse.status).toBe(404);
		});
	});

	describe('Delete Recording Validation', () => {
		let room: MeetRoom, recordingId: string, moderatorToken: string;
		beforeAll(async () => {
			await deleteAllRecordings();
			const testContext = await setupMultiRecordingsTestContext(1, 1, 1);
			const roomData = testContext.getRoomByIndex(0)!;

			({ room, recordingId = '', moderatorToken } = roomData);
		});

		afterAll(async () => {
			await stopAllRecordings(moderatorToken);
			await Promise.all([deleteAllRecordings(), deleteAllRooms()]);
		});

		it('should fail when recordingId has incorrect format', async () => {
			const response = await deleteRecording('incorrect-format');
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should fail when recordingId has less than 3 parts', async () => {
			const response = await deleteRecording('part1--part2');
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should fail when recordingId first part is empty', async () => {
			const response = await deleteRecording('--EG_12345--uid');
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should fail when recordingId second part does not start with EG_', async () => {
			const response = await deleteRecording(`${room.roomId}--INVALID--uid`);
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should fail when recordingId second part is too short', async () => {
			const response = await deleteRecording(`${room.roomId}--EG_--uid`);
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should fail when recordingId third part is empty', async () => {
			const response = await deleteRecording(`${room.roomId}--EG_12345--`);
			expectValidationError(response, 'recordingId', 'does not follow the expected format');
		});

		it('should sanitize recordingId before validation', async () => {
			const response = await deleteRecording(` ${recordingId} `);
			expect(response.status).toBe(200);
		});

		it('should return 409 when attempting to delete an active recording', async () => {
			const testContext = await setupMultiRecordingsTestContext(1, 1, 0);
			const { recordingId: activeRecordingId = '', moderatorToken } = testContext.rooms[0];

			// Attempt to delete the active recording
			let deleteResponse = await deleteRecording(activeRecordingId);
			expect(deleteResponse.status).toBe(409);

			await stopRecording(activeRecordingId, moderatorToken);
			// Attempt to delete the recording again
			deleteResponse = await deleteRecording(activeRecordingId);
			expect(deleteResponse.status).toBe(200);
		});
	});
});
