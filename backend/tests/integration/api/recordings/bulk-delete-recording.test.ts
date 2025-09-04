import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { container } from '../../../../src/config';
import { MeetStorageService } from '../../../../src/services';
import { expectValidationError, expectValidStartRecordingResponse } from '../../../helpers/assertion-helpers';
import {
	bulkDeleteRecordings,
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	generateRecordingTokenCookie,
	getAllRecordings,
	startRecording,
	startTestServer,
	stopRecording
} from '../../../helpers/request-helpers';
import { setupMultiRecordingsTestContext, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios';

describe('Recording API Tests', () => {
	beforeAll(async () => {
		startTestServer();
		await deleteAllRecordings();
	});

	afterEach(async () => {
		// Ensure a clean state after each test
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
		const recordings = await getAllRecordings();
		expect(recordings.body.recordings).toHaveLength(0);
	});

	describe('Bulk Delete Recording Tests', () => {
		it('should return 400 when mixed valid and non-existent IDs are provided', async () => {
			const testContext = await setupMultiRecordingsTestContext(3, 3, 3);
			const recordingIds = testContext.rooms.map((room) => room.recordingId);
			const nonExistentIds = ['nonExistent--EG_000--1234', 'nonExistent--EG_111--5678'];
			const mixedIds = [...recordingIds, ...nonExistentIds];

			const deleteResponse = await bulkDeleteRecordings(mixedIds);

			expect(deleteResponse.status).toBe(400);
			expect(deleteResponse.body).toEqual({
				message: expect.stringContaining('could not be deleted'),
				deleted: expect.arrayContaining(recordingIds),
				failed: expect.arrayContaining(
					nonExistentIds.map((id) => ({
						recordingId: id,
						error: expect.stringContaining(`Recording '${id}' not found`)
					}))
				)
			});
		});

		it('should return 400 with mixed results when some recordings are in active state', async () => {
			const testContext = await setupMultiRecordingsTestContext(3, 3, 2);
			const activeRecordingRoom = testContext.getLastRoom();
			const recordingIds = testContext.rooms
				.map((room) => room.recordingId)
				.filter((id) => id !== activeRecordingRoom!.recordingId);

			const activeRecordingId = activeRecordingRoom?.recordingId;
			let deleteResponse = await bulkDeleteRecordings([...recordingIds, activeRecordingId]);

			expect(deleteResponse.status).toBe(400);
			expect(deleteResponse.body).toEqual({
				message: expect.stringContaining('could not be deleted'),
				deleted: expect.arrayContaining(recordingIds),
				failed: [
					{
						recordingId: activeRecordingId,
						error: expect.stringContaining(`Recording '${activeRecordingId}' is not stopped yet`)
					}
				]
			});

			await stopRecording(activeRecordingId!, activeRecordingRoom!.moderatorCookie);

			deleteResponse = await bulkDeleteRecordings([activeRecordingId]);

			expect(deleteResponse.status).toBe(200);
			expect(deleteResponse.body).toEqual({
				message: expect.stringContaining('All recordings deleted successfully'),
				deleted: expect.arrayContaining([activeRecordingId])
			});
		});

		it('should not delete any recordings and return 400', async () => {
			const testContext = await setupMultiRecordingsTestContext(2, 2, 0);
			const recordingIds = testContext.rooms.map((room) => room.recordingId);
			const deleteResponse = await bulkDeleteRecordings(recordingIds);
			expect(deleteResponse.status).toBe(400);
			expect(deleteResponse.body).toEqual({
				message: expect.stringContaining('could not be deleted'),
				deleted: [],
				failed: expect.arrayContaining(
					recordingIds.map((id) => ({
						recordingId: id,
						error: expect.stringContaining(`Recording '${id}' is not stopped yet`)
					}))
				)
			});

			await Promise.all(
				recordingIds.map((id, index) => {
					return stopRecording(id!, testContext.getRoomByIndex(index)!.moderatorCookie);
				})
			);
		});

		it('should delete all recordings and return 200 when all operations succeed', async () => {
			const response = await setupMultiRecordingsTestContext(5, 5, 5);
			const recordingIds = response.rooms.map((room) => room.recordingId);
			const deleteResponse = await bulkDeleteRecordings(recordingIds);

			expect(deleteResponse.status).toBe(200);
		});

		it('should only delete recordings belonging to the room when using a recording token', async () => {
			// Create a room and start a recording
			const roomData = await setupSingleRoomWithRecording(true);
			const roomId = roomData.room.roomId;
			const recordingId = roomData.recordingId;

			// Generate a recording token for the room
			const recordingCookie = await generateRecordingTokenCookie(roomId, roomData.moderatorSecret);

			// Create another room and start a recording
			const otherRoomData = await setupSingleRoomWithRecording(true);
			const otherRecordingId = otherRoomData.recordingId;

			// Intenta eliminar ambas grabaciones usando el token de la primera sala
			const deleteResponse = await bulkDeleteRecordings([recordingId, otherRecordingId], recordingCookie);

			expect(deleteResponse.status).toBe(400);
			expect(deleteResponse.body).toEqual({
				message: expect.stringContaining('could not be deleted'),
				deleted: [recordingId],
				failed: [
					{
						recordingId: otherRecordingId,
						error: expect.stringContaining(
							`Recording '${otherRecordingId}' does not belong to room '${roomId}'`
						)
					}
				]
			});
		});

		it('should delete all recordings and their secrets', async () => {
			const response = await setupMultiRecordingsTestContext(3, 3, 3);
			const recordingIds = response.rooms.map((room) => room.recordingId);
			const deleteResponse = await bulkDeleteRecordings(recordingIds);

			expect(deleteResponse.status).toBe(200);

			const storageService = container.get(MeetStorageService);

			for (const recordingId of recordingIds) {
				const recSecrets = await storageService.getAccessRecordingSecrets(recordingId!);
				expect(recSecrets).toBeNull();
			}
		});

		it('should handle single recording deletion correctly', async () => {
			const testContext = await setupMultiRecordingsTestContext(1, 1, 1);
			const recordingId = testContext.rooms[0].recordingId;
			const deleteResponse = await bulkDeleteRecordings([recordingId]);

			expect(deleteResponse.status).toBe(200);
		});

		it('should handle duplicate recording IDs by treating them as a single delete', async () => {
			const testContext = await setupMultiRecordingsTestContext(1, 1, 1);
			const recordingId = testContext.getRoomByIndex(0)!.recordingId;
			const deleteResponse = await bulkDeleteRecordings([recordingId, recordingId]);

			expect(deleteResponse.status).toBe(200);
		});

		it('should delete room metadata when deleting the last recording', async () => {
			const meetStorageService = container.get<MeetStorageService>(MeetStorageService);
			// Create two recordings in the same room
			const testContext = await setupMultiRecordingsTestContext(1, 1, 1);
			const { room, recordingId: firstRecordingId, moderatorCookie } = testContext.rooms[0];

			let roomMetadata = await meetStorageService.getArchivedRoomMetadata(room.roomId);

			expect(roomMetadata).toBeDefined();
			expect(roomMetadata!.moderatorUrl).toContain(room.roomId);
			expect(roomMetadata!.speakerUrl).toContain(room.roomId);

			roomMetadata = await meetStorageService.getArchivedRoomMetadata(room.roomId);

			expect(roomMetadata).toBeDefined();
			expect(roomMetadata!.moderatorUrl).toContain(room.roomId);
			expect(roomMetadata!.speakerUrl).toContain(room.roomId);

			const response = await startRecording(room.roomId, moderatorCookie);
			expectValidStartRecordingResponse(response, room.roomId, room.roomName);
			const secondRecordingId = response.body.recordingId;

			await stopRecording(secondRecordingId, moderatorCookie);
			// Delete first recording - room metadata should remain
			const bulkResponse = await bulkDeleteRecordings([firstRecordingId, secondRecordingId]);
			expect(bulkResponse.status).toBe(200);

			// // Verify second recording still exists
			// const secondRecordingResponse = await getRecording(secondRecordingId);
			// console.log('Second recording response:', secondRecordingId);
			// console.log('Second recording response:', secondRecordingResponse.body);
			// expectValidGetRecordingResponse(
			// 	secondRecordingResponse,
			// 	secondRecordingId,
			// 	room.roomId,
			// 	room.roomName,
			// 	MeetRecordingStatus.COMPLETE,
			// 	3
			// );

			// // Delete second recording - room metadata should be deleted
			// await bulkDeleteRecordings([secondRecordingId]);

			roomMetadata = await meetStorageService.getArchivedRoomMetadata(room.roomId);
			expect(roomMetadata).toBe(null);
		});
	});

	describe('Bulk Delete Recording Validation', () => {
		it('should handle empty recordingIds array gracefully', async () => {
			const response = await bulkDeleteRecordings([]);

			expectValidationError(response, 'recordingIds', 'recordingIds must contain at least one item');
		});

		it('should reject a CSV string with invalid format', async () => {
			const invalidRecordingIds = 'invalid--recording.id,invalid--EG_111--5678';
			const response = await bulkDeleteRecordings([invalidRecordingIds]);

			expectValidationError(response, 'recordingIds.0', 'recordingId does not follow the expected format');
		});

		it('should reject an array containing empty strings after sanitization', async () => {
			const invalidRecordingIds = ['', '   '];
			const response = await bulkDeleteRecordings(invalidRecordingIds);

			expectValidationError(response, 'recordingIds', 'recordingIds must contain at least one item');
		});

		it('should reject an array with mixed valid and totally invalid IDs', async () => {
			const invalidRecordingIds = ['valid--EG_111--5678', 'invalid--recording.id'];
			const response = await bulkDeleteRecordings(invalidRecordingIds);

			expectValidationError(response, 'recordingIds.1', 'recordingId does not follow the expected format');
		});
	});
});
