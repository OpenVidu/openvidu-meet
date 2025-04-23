import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
	bulkDeleteRecordings,
	deleteAllRecordings,
	deleteAllRooms,
	startTestServer,
	stopRecording,
	stopTestServer
} from '../../../utils/helpers';
import { setupMultiRecordingsTestContext } from '../../../utils/test-scenarios';

describe('Recording API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await deleteAllRooms();
		await deleteAllRecordings();
		await stopTestServer();
	});

	describe('Bulk Delete Recording Tests', () => {
		it('"should return 200 when mixed valid and non-existent IDs are provided', async () => {
			const testContext = await setupMultiRecordingsTestContext(3, 3, 3, '0s');
			const recordingIds = testContext.rooms.map((room) => room.recordingId);
			const nonExistentIds = ['nonExistent--EG_000--1234', 'nonExistent--EG_111--5678'];
			const mixedIds = [...recordingIds, ...nonExistentIds];

			const deleteResponse = await bulkDeleteRecordings(mixedIds);

			expect(deleteResponse.status).toBe(200);
			expect(deleteResponse.body).toEqual({
				deleted: expect.arrayContaining(recordingIds),
				notDeleted: expect.arrayContaining(
					nonExistentIds.map((id) => ({
						recordingId: id,
						error: expect.stringContaining(`Recording '${id}' not found`)
					}))
				)
			});
		});

		it('should return 200 with mixed results when some recordings are in active state', async () => {
			const testContext = await setupMultiRecordingsTestContext(3, 3, 2, '0s');
			const activeRecordingRoom = testContext.getLastRoom();
			const recordingIds = testContext.rooms
				.map((room) => room.recordingId)
				.filter((id) => id !== activeRecordingRoom!.recordingId);

			const activeRecordingId = activeRecordingRoom?.recordingId;
			let deleteResponse = await bulkDeleteRecordings([...recordingIds, activeRecordingId]);

			expect(deleteResponse.status).toBe(200);
			expect(deleteResponse.body).toEqual({
				deleted: expect.arrayContaining(recordingIds),
				notDeleted: [
					{
						recordingId: activeRecordingId,
						error: expect.stringContaining(`Recording '${activeRecordingId}' is not stopped yet`)
					}
				]
			});

			await stopRecording(activeRecordingId!, activeRecordingRoom!.moderatorCookie);

			deleteResponse = await bulkDeleteRecordings([activeRecordingId]);

			expect(deleteResponse.status).toBe(204);
			expect(deleteResponse.body).toStrictEqual({});
		});

		it('should not delete any recordings and return 200', async () => {
			const testContext = await setupMultiRecordingsTestContext(2, 2, 0, '0s');
			const recordingIds = testContext.rooms.map((room) => room.recordingId);
			const deleteResponse = await bulkDeleteRecordings(recordingIds);
			expect(deleteResponse.status).toBe(200);
			expect(deleteResponse.body).toEqual({
				deleted: [],
				notDeleted: expect.arrayContaining(
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

		it('should delete all recordings and return 204 when all operations succeed', async () => {
			const response = await setupMultiRecordingsTestContext(5, 5, 5, '0s');
			const recordingIds = response.rooms.map((room) => room.recordingId);
			const deleteResponse = await bulkDeleteRecordings(recordingIds);

			expect(deleteResponse.status).toBe(204);
		});

		it('should handle single recording deletion correctly', async () => {
			const testContext = await setupMultiRecordingsTestContext(1, 1, 1, '0s');
			const recordingId = testContext.rooms[0].recordingId;
			const deleteResponse = await bulkDeleteRecordings([recordingId]);

			expect(deleteResponse.status).toBe(204);
			expect(deleteResponse.body).toStrictEqual({});
		});

		it('should handle duplicate recording IDs by treating them as a single delete', async () => {
			const testContext = await setupMultiRecordingsTestContext(1, 1, 1, '0s');
			const recordingId = testContext.getRoomByIndex(0)!.recordingId;
			const deleteResponse = await bulkDeleteRecordings([recordingId, recordingId]);

			expect(deleteResponse.status).toBe(204);
			expect(deleteResponse.body).toStrictEqual({});
		});
	});

	describe('Bulk Delete Recording Validation', () => {
		it('should handle empty recordingIds array gracefully', async () => {
			const deleteResponse = await bulkDeleteRecordings([]);

			expect(deleteResponse.status).toBe(422);
			expect(deleteResponse.body).toEqual({
				details: [
					{
						field: 'recordingIds',
						message: 'recordingIds must contain at least one item'
					}
				],
				error: 'Unprocessable Entity',
				message: 'Invalid request'
			});
		});

		it('should reject a CSV string with invalid format', async () => {
			const invalidRecordingIds = 'invalid--recording.id,invalid--EG_111--5678';
			const deleteResponse = await bulkDeleteRecordings([invalidRecordingIds]);

			expect(deleteResponse.status).toBe(422);
			expect(deleteResponse.body).toMatchObject({
				details: [
					{
						message: 'recordingId does not follow the expected format'
					}
				],
				error: 'Unprocessable Entity',
				message: 'Invalid request'
			});
		});

		it('should reject an array containing empty strings after sanitization', async () => {
			const invalidRecordingIds = ['', '   '];
			const deleteResponse = await bulkDeleteRecordings(invalidRecordingIds);

			expect(deleteResponse.status).toBe(422);
			expect(deleteResponse.body).toMatchObject({
				details: [
					{
						message: 'recordingIds must contain at least one item'
					}
				],
				error: 'Unprocessable Entity',
				message: 'Invalid request'
			});
		});

		it('should reject an array with mixed valid and totally invalid IDs', async () => {
			const invalidRecordingIds = ['valid--EG_111--5678', 'invalid--recording.id'];
			const deleteResponse = await bulkDeleteRecordings(invalidRecordingIds);

			expect(deleteResponse.status).toBe(422);
			expect(deleteResponse.body).toMatchObject({
				details: [
					{
						message: 'recordingId does not follow the expected format'
					}
				],
				error: 'Unprocessable Entity',
				message: 'Invalid request'
			});
		});
	});
});
