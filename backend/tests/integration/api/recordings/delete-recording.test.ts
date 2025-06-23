import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { container } from '../../../../src/config';
import { MeetStorageService } from '../../../../src/services';
import { MeetRoom } from '../../../../src/typings/ce';
import { expectValidationError, expectValidStartRecordingResponse } from '../../../helpers/assertion-helpers';
import {
	deleteAllRecordings,
	deleteAllRooms,
	deleteRecording,
	disconnectFakeParticipants,
	startRecording,
	startTestServer,
	stopAllRecordings,
	stopRecording
} from '../../../helpers/request-helpers';
import { setupMultiRecordingsTestContext } from '../../../helpers/test-scenarios';

describe('Recording API Tests', () => {
	beforeAll(async () => {
		startTestServer();
		await deleteAllRecordings();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	describe('Delete Recording Tests', () => {
		let room: MeetRoom, recordingId: string, moderatorCookie: string;

		beforeEach(async () => {
			const testContext = await setupMultiRecordingsTestContext(1, 1, 1);
			const roomData = testContext.getRoomByIndex(0)!;

			({ room, recordingId = '', moderatorCookie } = roomData);
		});

		afterAll(async () => {
			await stopAllRecordings(moderatorCookie);
			await Promise.all([deleteAllRecordings(), deleteAllRooms()]);
		});

		it('should delete a recording successfully', async () => {
			// Delete the recording
			const deleteResponse = await deleteRecording(recordingId);
			expect(deleteResponse.status).toBe(204);

			// Verify that the recording is deleted
			const getResponse = await deleteRecording(recordingId);
			expect(getResponse.status).toBe(404);
		});

		it('should secrets be deleted when recording is deleted', async () => {
			const storageService = container.get(MeetStorageService);

			let recSecrets = await storageService.getAccessRecordingSecrets(recordingId);
			expect(recSecrets).toBeDefined();
			expect(recSecrets?.publicAccessSecret).toBeDefined();
			expect(recSecrets?.privateAccessSecret).toBeDefined();

			// Check that the room metadata still exists after deleteing the first recording
			const deleteResponse = await deleteRecording(recordingId!);
			expect(deleteResponse.status).toBe(204);

			recSecrets = await storageService.getAccessRecordingSecrets(recordingId);
			expect(recSecrets).toBe(null);
		});

		it('should delete room metadata when deleting the last recording', async () => {
			const meetStorageService = container.get<MeetStorageService>(MeetStorageService);

			// Check that the room metadata exists after starting the first recording
			let roomMetadata = await meetStorageService.getArchivedRoomMetadata(room.roomId);
			expect(roomMetadata).toBeDefined();
			expect(roomMetadata!.moderatorRoomUrl).toContain(room.roomId);
			expect(roomMetadata!.publisherRoomUrl).toContain(room.roomId);

			// Generate a new recording
			const response = await startRecording(room.roomId, moderatorCookie);
			console.log('Start recording response:', response.body);
			expectValidStartRecordingResponse(response, room.roomId);
			const secondRecordingId = response.body.recordingId;
			await stopRecording(secondRecordingId, moderatorCookie);

			// Check that the room metadata still exists after deleteing the first recording
			let deleteResponse = await deleteRecording(recordingId!);
			expect(deleteResponse.status).toBe(204);

			roomMetadata = await meetStorageService.getArchivedRoomMetadata(room.roomId);

			expect(roomMetadata).toBeDefined();
			expect(roomMetadata!.moderatorRoomUrl).toContain(room.roomId);
			expect(roomMetadata!.publisherRoomUrl).toContain(room.roomId);

			// Delete the second recording
			deleteResponse = await deleteRecording(secondRecordingId!);
			expect(deleteResponse.status).toBe(204);

			// Verify that the room metadata is deleted after deleting the last recording
			roomMetadata = await meetStorageService.getArchivedRoomMetadata(room.roomId);
			expect(roomMetadata).toBe(null);
		});
	});

	describe('Delete Recording Validation', () => {
		let room: MeetRoom, recordingId: string, moderatorCookie: string;
		beforeAll(async () => {
			await deleteAllRecordings();
			const testContext = await setupMultiRecordingsTestContext(1, 1, 1);
			const roomData = testContext.getRoomByIndex(0)!;

			({ room, recordingId = '', moderatorCookie } = roomData);
		});

		afterAll(async () => {
			await stopAllRecordings(moderatorCookie);
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
			expect(response.status).toBe(204);
			expect(response.body).toStrictEqual({});
		});

		it('should return 409 when attempting to delete an active recording', async () => {
			const testContext = await setupMultiRecordingsTestContext(1, 1, 0);
			const { recordingId: activeRecordingId = '', moderatorCookie } = testContext.rooms[0];

			// Attempt to delete the active recording
			let deleteResponse = await deleteRecording(activeRecordingId);
			expect(deleteResponse.status).toBe(409);

			await stopRecording(activeRecordingId, moderatorCookie);
			// Attempt to delete the recording again
			deleteResponse = await deleteRecording(activeRecordingId);
			expect(deleteResponse.status).toBe(204);
		});
	});
});
