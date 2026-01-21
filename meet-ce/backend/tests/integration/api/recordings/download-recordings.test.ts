import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import stream from 'stream';
import unzipper from 'unzipper';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	downloadRecordings,
	generateRoomMemberToken,
	startTestServer
} from '../../../helpers/request-helpers';
import { setupMultiRecordingsTestContext, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios';

describe('Recording API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
		await deleteAllRecordings();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRecordings(), deleteAllRooms()]);
	});

	const getZipEntries = async (buffer: Buffer) => {
		const entries: string[] = [];
		await stream.Readable.from(buffer)
			.pipe(unzipper.Parse())
			.on('entry', (entry) => {
				entries.push(entry.path);
				entry.autodrain();
			})
			.promise();
		return entries;
	};

	describe('Download Recordings as ZIP Tests', () => {
		it('should download a ZIP with multiple recordings', async () => {
			const testContext = await setupMultiRecordingsTestContext(2, 2, 2);
			const recordingIds = testContext.rooms.map((room) => room.recordingId!);
			const roomIds = testContext.rooms.map((roomData) => roomData.room.roomId);

			const res = await downloadRecordings(recordingIds);

			expect(res.status).toBe(200);
			expect(res.headers['content-type']).toBe('application/zip');
			expect(res.headers['content-disposition']).toContain('attachment; filename="recordings.zip"');

			const entries = await getZipEntries(res.body);
			expect(entries.length).toBe(2);
			// Check that filenames match expected
			roomIds.forEach((id) => {
				expect(entries.some((name) => name.includes(id))).toBe(true);
			});
		});

		it('should only include recordings from the room when using a recording token', async () => {
			const roomData = await setupSingleRoomWithRecording(true);
			const roomId = roomData.room.roomId;
			const recordingId = roomData.recordingId!;
			const roomMemberToken = await generateRoomMemberToken(roomId, { secret: roomData.moderatorSecret });

			const otherRoomData = await setupSingleRoomWithRecording(true);
			const otherRecordingId = otherRoomData.recordingId!;

			const res = await downloadRecordings([recordingId, otherRecordingId], true, roomMemberToken);

			expect(res.status).toBe(200);
			const entries = await getZipEntries(res.body);
			expect(entries.length).toBe(1);
			expect(entries[0]).toContain(roomId);
		});

		it('should return an error if none of the recordings belong to the room in the token', async () => {
			const roomData = await setupSingleRoomWithRecording(true);
			const roomId = roomData.room.roomId;
			const roomMemberToken = await generateRoomMemberToken(roomId, { secret: roomData.moderatorSecret });

			const otherRoomData = await setupSingleRoomWithRecording(true);
			const otherRecordingId = otherRoomData.recordingId!;

			const res = await downloadRecordings([otherRecordingId], false, roomMemberToken);

			expect(res.status).toBe(400);
			expect(res.body).toHaveProperty('error');
			expect(res.body.message).toContain(`None of the provided recording IDs belong to room '${roomId}'`);
		});
	});

	describe('Download Recordings as ZIP Validation', () => {
		it('should handle empty recordingIds array gracefully', async () => {
			const response = await downloadRecordings([], false);

			expectValidationError(response, 'recordingIds', 'At least one recordingId is required');
		});

		it('should reject an array with mixed valid and totally invalid IDs', async () => {
			const invalidRecordingIds = ['valid--EG_111--5678', 'invalid--recording.id'];
			const response = await downloadRecordings(invalidRecordingIds, false);

			expectValidationError(response, 'recordingIds.1', 'recordingId does not follow the expected format');
		});

		it('should reject an array containing empty strings after sanitization', async () => {
			const invalidRecordingIds = ['', '   '];
			const response = await downloadRecordings(invalidRecordingIds, false);

			expectValidationError(response, 'recordingIds', 'At least one recordingId is required');
		});
	});
});
