import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import stream from 'stream';
import unzipper from 'unzipper';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { RecordingRepository } from '../../../../src/repositories/recording.repository.js';
import { BlobStorageService } from '../../../../src/services/storage/blob-storage.service.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	downloadRecordings,
	generateRoomMemberToken,
	startTestServer
} from '../../../helpers/request-helpers.js';

import { setupRoomMember, setupSingleRoomWithRecording, setupTestUsers } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';

describe('Recording API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
		await deleteAllRecordings();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
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
		let roomData: RoomData;
		let otherRoomData: RoomData;

		beforeAll(async () => {
			[roomData, otherRoomData] = await Promise.all([
				setupSingleRoomWithRecording(true),
				setupSingleRoomWithRecording(true)
			]);
		});

		it('should download a ZIP with multiple recordings', async () => {
			const res = await downloadRecordings([roomData.recordingId!, otherRoomData.recordingId!]);

			expect(res.status).toBe(200);
			expect(res.headers['content-type']).toBe('application/zip');
			expect(res.headers['content-disposition']).toContain('attachment; filename="recordings.zip"');

			const entries = await getZipEntries(res.body);
			expect(entries.length).toBe(2);
			[roomData, otherRoomData].forEach(({ room }) => {
				expect(entries.some((name) => name.includes(room.roomId))).toBe(true);
			});
		});

		it('should leave out a recording whose file is no longer in the storage', async () => {
			const lost = await setupSingleRoomWithRecording(true);
			await container.get(BlobStorageService).deleteRecordingMedia(lost.recordingId!);

			try {
				const res = await downloadRecordings([lost.recordingId!, roomData.recordingId!]);

				expect(res.status).toBe(200);
				expect(await getZipEntries(res.body)).toEqual([expect.stringContaining(roomData.room.roomId)]);
			} finally {
				await container.get(RecordingRepository).deleteByRecordingId(lost.recordingId!);
			}
		});

		it('should only include recordings from the room when using a room member token', async () => {
			const roomId = roomData.room.roomId;
			const roomMemberToken = await generateRoomMemberToken(roomId, { secret: roomData.moderatorSecret });

			const res = await downloadRecordings(
				[roomData.recordingId!, otherRoomData.recordingId!],
				true,
				roomMemberToken
			);

			expect(res.status).toBe(200);
			const entries = await getZipEntries(res.body);
			expect(entries.length).toBe(1);
			expect(entries[0]).toContain(roomId);
		});

		it('should only include the recordings of the rooms a room manager may download', async () => {
			const { roomManager } = await setupTestUsers();
			await setupRoomMember(
				roomData.room.roomId,
				{ userId: roomManager.user.userId, baseRole: MeetRoomMemberRole.MODERATOR },
				roomManager.accessToken
			);

			const res = await downloadRecordings(
				[otherRoomData.recordingId!, roomData.recordingId!, 'non_existent--EG_000--1234'],
				true,
				undefined,
				roomManager.accessToken
			);

			expect(res.status).toBe(200);
			const entries = await getZipEntries(res.body);
			expect(entries.length).toBe(1);
			expect(entries[0]).toContain(roomData.room.roomId);
		});

		it('should return an error if none of the recordings belong to the room in the token', async () => {
			const roomMemberToken = await generateRoomMemberToken(roomData.room.roomId, {
				secret: roomData.moderatorSecret
			});

			const res = await downloadRecordings([otherRoomData.recordingId!], false, roomMemberToken);

			expect(res.status).toBe(400);
			expect(res.body).toHaveProperty('error');
			expect(res.body.message).toContain('None of the provided recordings are available for ZIP download');
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

		it('should reject more distinct recordingIds than one request accepts', async () => {
			const tooMany = Array.from(
				{ length: INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS + 1 },
				(_, i) => `room--EG_${i}--uid`
			);
			const response = await downloadRecordings(tooMany, false);

			expectValidationError(
				response,
				'recordingIds',
				`recordingIds cannot exceed ${INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS} items`
			);
		});

		it('should count repeated recordingIds once against the limit', async () => {
			const repeated = Array.from({ length: INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS + 1 }, () => 'room--EG_1--uid');
			const response = await downloadRecordings(repeated, false);

			expect(response.status).not.toBe(422);
		});
	});
});
