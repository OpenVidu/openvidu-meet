import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { AuthTransportMode, MeetRecordingAccess, ParticipantRole} from '@openvidu-meet/typings';
import { expectValidRecordingTokenResponse } from '../../../helpers/assertion-helpers.js';
import {
	changeAuthTransportMode,
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	extractCookieFromHeaders,
	generateRecordingTokenRequest,
	startTestServer,
	updateRecordingAccessConfigInRoom
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	let roomData: RoomData;

	beforeAll(async () => {
		await startTestServer();
		roomData = await setupSingleRoomWithRecording(true);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	describe('Generate Recording Token Tests', () => {
		it('should generate a recording token with canRetrieve and canDelete permissions when using the moderator secret and recording access is admin_moderator', async () => {
			await updateRecordingAccessConfigInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);

			const response = await generateRecordingTokenRequest(roomData.room.roomId, roomData.moderatorSecret);
			expectValidRecordingTokenResponse(response, roomData.room.roomId, ParticipantRole.MODERATOR, true, true);
		});

		it('should generate a recording token with canRetrieve and canDelete permissions when using the moderator secret and recording access is admin_moderator_speaker', async () => {
			await updateRecordingAccessConfigInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER);

			const response = await generateRecordingTokenRequest(roomData.room.roomId, roomData.moderatorSecret);
			expectValidRecordingTokenResponse(response, roomData.room.roomId, ParticipantRole.MODERATOR, true, true);
		});

		it('should generate a recording token without any permissions when using the speaker secret and recording access is admin_moderator', async () => {
			await updateRecordingAccessConfigInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR);

			const response = await generateRecordingTokenRequest(roomData.room.roomId, roomData.speakerSecret);
			expectValidRecordingTokenResponse(response, roomData.room.roomId, ParticipantRole.SPEAKER, false, false);
		});

		it('should generate a recording token with canRetrieve permission but not canDelete when using the speaker secret and recording access is admin_moderator_speaker', async () => {
			await updateRecordingAccessConfigInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER);

			const response = await generateRecordingTokenRequest(roomData.room.roomId, roomData.speakerSecret);
			expectValidRecordingTokenResponse(response, roomData.room.roomId, ParticipantRole.SPEAKER, true, false);
		});

		it('should generate a recording token and store it in a cookie when in cookie mode', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Generate the recording token
			await updateRecordingAccessConfigInRoom(roomData.room.roomId, MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER);
			const response = await generateRecordingTokenRequest(roomData.room.roomId, roomData.moderatorSecret);
			expectValidRecordingTokenResponse(response, roomData.room.roomId, ParticipantRole.MODERATOR, true, true);

			// Check that the token is included in a cookie
			const recordingTokenCookie = extractCookieFromHeaders(
				response,
				INTERNAL_CONFIG.RECORDING_TOKEN_COOKIE_NAME
			);
			expect(recordingTokenCookie).toBeDefined();
			expect(recordingTokenCookie).toContain(response.body.token);
			expect(recordingTokenCookie).toContain('HttpOnly');
			expect(recordingTokenCookie).toContain('SameSite=None');
			expect(recordingTokenCookie).toContain('Secure');
			expect(recordingTokenCookie).toContain('Path=/');

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail with a 404 error if the room does not exist', async () => {
			const response = await generateRecordingTokenRequest('non-existent-room-id', roomData.moderatorSecret);
			expect(response.status).toBe(404);
		});

		it('should fail with a 400 error if the secret is invalid', async () => {
			const response = await generateRecordingTokenRequest(roomData.room.roomId, 'invalid-secret');
			expect(response.status).toBe(400);
		});
	});
});
