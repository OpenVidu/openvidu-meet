import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ParticipantRole } from '../../../../src/typings/ce/participant.js';
import { MeetRecordingAccess } from '../../../../src/typings/ce/room-preferences.js';
import { expectValidRecordingTokenResponse } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	deleteRoom,
	disconnectFakeParticipants,
	generateRecordingToken,
	startTestServer,
	updateRecordingAccessPreferencesInRoom
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	let roomData: RoomData;

	beforeAll(async () => {
		startTestServer();
		roomData = await setupSingleRoomWithRecording(true);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	describe('Generate Recording Token Tests', () => {
		it('should generate a recording token with canRetrieve and canDelete permissions when using the moderator secret and recording access is admin_moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);

			const response = await generateRecordingToken(roomData.room.roomId, roomData.moderatorSecret);
			expectValidRecordingTokenResponse(response, roomData.room.roomId, ParticipantRole.MODERATOR, true, true);
		});

		it('should generate a recording token with canRetrieve and canDelete permissions when using the moderator secret and recording access is admin_moderator_speaker', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
			);

			const response = await generateRecordingToken(roomData.room.roomId, roomData.moderatorSecret);
			expectValidRecordingTokenResponse(response, roomData.room.roomId, ParticipantRole.MODERATOR, true, true);
		});

		it('should generate a recording token without any permissions when using the speaker secret and recording access is admin_moderator', async () => {
			await updateRecordingAccessPreferencesInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);

			const response = await generateRecordingToken(roomData.room.roomId, roomData.speakerSecret);
			expectValidRecordingTokenResponse(response, roomData.room.roomId, ParticipantRole.SPEAKER, false, false);
		});

		it('should generate a recording token with canRetrieve permission but not canDelete when using the speaker secret and recording access is admin_moderator_speaker', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
			);

			const response = await generateRecordingToken(roomData.room.roomId, roomData.speakerSecret);
			expectValidRecordingTokenResponse(response, roomData.room.roomId, ParticipantRole.SPEAKER, true, false);
		});

		it('should succeed even if the room is deleted', async () => {
			await updateRecordingAccessPreferencesInRoom(
				roomData.room.roomId,
				MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
			);
			await deleteRoom(roomData.room.roomId);

			const response = await generateRecordingToken(roomData.room.roomId, roomData.moderatorSecret);
			expectValidRecordingTokenResponse(response, roomData.room.roomId, ParticipantRole.MODERATOR, true, true);

			// Recreate the room with recording
			roomData = await setupSingleRoomWithRecording(true);
		});

		it('should fail with a 404 error if there are no recordings in the room', async () => {
			await deleteAllRecordings();

			const response = await generateRecordingToken(roomData.room.roomId, roomData.moderatorSecret);
			expect(response.status).toBe(404);

			// Recreate the room with recording
			roomData = await setupSingleRoomWithRecording(true);
		});

		it('should fail with a 404 error if the room does not exist', async () => {
			const response = await generateRecordingToken('non-existent-room-id', roomData.moderatorSecret);
			expect(response.status).toBe(404);
		});

		it('should fail with a 400 error if the secret is invalid', async () => {
			const response = await generateRecordingToken(roomData.room.roomId, 'invalid-secret');
			expect(response.status).toBe(400);
		});
	});
});
