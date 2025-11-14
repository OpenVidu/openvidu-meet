import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MeetRecordingAccess,
	MeetRoomMemberRole,
	MeetRoomMemberTokenOptions,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import { expectValidationError, expectValidRoomMemberTokenResponse } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRooms,
	disconnectFakeParticipants,
	endMeeting,
	generateRoomMemberTokenRequest,
	startTestServer,
	updateRecordingAccessConfigInRoom,
	updateRoomStatus
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	let roomData: RoomData;
	let roomId: string;

	beforeAll(async () => {
		await startTestServer();
		roomData = await setupSingleRoom();
		roomId = roomData.room.roomId;
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Generate Room Member Token Tests', () => {
		it('should generate a room member token with moderator permissions when using the moderator secret', async () => {
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret
			});
			expectValidRoomMemberTokenResponse(response, roomId, MeetRoomMemberRole.MODERATOR);
		});

		it('should generate a room member token with speaker permissions when using the speaker secret', async () => {
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.speakerSecret
			});
			expectValidRoomMemberTokenResponse(response, roomId, MeetRoomMemberRole.SPEAKER);
		});

		it('should generate a room member token without join meeting permission when not specifying grantJoinMeetingPermission', async () => {
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret
			});
			expectValidRoomMemberTokenResponse(response, roomId, MeetRoomMemberRole.MODERATOR, false);
		});

		it('should generate a room member token with join meeting permission when specifying grantJoinMeetingPermission true and participantName', async () => {
			const participantName = 'TEST_PARTICIPANT';
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				grantJoinMeetingPermission: true,
				participantName
			});
			expectValidRoomMemberTokenResponse(response, roomId, MeetRoomMemberRole.MODERATOR, true, participantName);

			// End the meeting for further tests
			await endMeeting(roomId, roomData.moderatorToken);
		});

		it('should success when when specifying grantJoinMeetingPermission true and participant already exists in the room', async () => {
			const participantName = 'TEST_PARTICIPANT';

			// Create token for the first participant
			let response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				grantJoinMeetingPermission: true,
				participantName
			});
			expectValidRoomMemberTokenResponse(response, roomId, MeetRoomMemberRole.MODERATOR, true, participantName);

			// Create token for the second participant with the same name
			response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				grantJoinMeetingPermission: true,
				participantName
			});
			expectValidRoomMemberTokenResponse(
				response,
				roomId,
				MeetRoomMemberRole.MODERATOR,
				true,
				participantName + '_1' // Participant name should be unique
			);

			// End the meeting for further tests
			await endMeeting(roomId, roomData.moderatorToken);
		});

		it('should refresh a room member token with join meeting permission for an existing participant', async () => {
			const participantName = 'TEST_PARTICIPANT';

			// Create room with initial participant
			const roomWithParticipant = await setupSingleRoom(true);

			// Refresh token for the participant by specifying participantIdentity
			const response = await generateRoomMemberTokenRequest(roomWithParticipant.room.roomId, {
				secret: roomWithParticipant.moderatorSecret,
				grantJoinMeetingPermission: true,
				participantName,
				participantIdentity: participantName
			});
			expectValidRoomMemberTokenResponse(
				response,
				roomWithParticipant.room.roomId,
				MeetRoomMemberRole.MODERATOR,
				true,
				participantName,
				participantName
			);
		});

		it('should fail with 409 when generating a room member token with join meeting permission and room is closed', async () => {
			// Close the room
			await updateRoomStatus(roomId, MeetRoomStatus.CLOSED);

			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				grantJoinMeetingPermission: true,
				participantName: 'TEST_PARTICIPANT'
			});
			expect(response.status).toBe(409);

			// Reopen the room for further tests
			await updateRoomStatus(roomId, MeetRoomStatus.OPEN);
		});

		it('should fail with 404 when room does not exist', async () => {
			const response = await generateRoomMemberTokenRequest('non-existent-room-id', {
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(404);
		});

		it('should fail with 404 when refreshing token and participant does not exist in the meeting', async () => {
			const participantName = 'NON_EXISTENT_PARTICIPANT';
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				grantJoinMeetingPermission: true,
				participantName,
				participantIdentity: participantName
			});
			expect(response.status).toBe(404);
		});

		it('should fail with 400 when secret is invalid', async () => {
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: 'invalid-secret'
			});
			expect(response.status).toBe(400);
		});
	});

	describe('Generate Room Member Token Recording Permissions Tests', () => {
		afterAll(async () => {
			// Reset recording access to default for other tests
			await updateRecordingAccessConfigInRoom(roomId, MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER);
		});

		it(`should generate a room member token with canRetrieve and canDelete permissions 
			when using the moderator secret and recording access is admin_moderator_speaker`, async () => {
			await updateRecordingAccessConfigInRoom(roomId, MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER);

			const response = await generateRoomMemberTokenRequest(roomId, { secret: roomData.moderatorSecret });
			expectValidRoomMemberTokenResponse(
				response,
				roomId,
				MeetRoomMemberRole.MODERATOR,
				false,
				undefined,
				undefined,
				true, // canRetrieveRecordings
				true // canDeleteRecordings
			);
		});

		it(`should generate a room member token with canRetrieve permission but not canDelete 
			when using the speaker secret and recording access is admin_moderator_speaker`, async () => {
			await updateRecordingAccessConfigInRoom(roomId, MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER);

			const response = await generateRoomMemberTokenRequest(roomId, { secret: roomData.speakerSecret });
			expectValidRoomMemberTokenResponse(
				response,
				roomId,
				MeetRoomMemberRole.SPEAKER,
				false,
				undefined,
				undefined,
				true, // canRetrieveRecordings
				false // canDeleteRecordings
			);
		});

		it(`should generate a room member token with canRetrieve and canDelete permissions 
			when using the moderator secret and recording access is admin_moderator`, async () => {
			await updateRecordingAccessConfigInRoom(roomId, MeetRecordingAccess.ADMIN_MODERATOR);

			const response = await generateRoomMemberTokenRequest(roomId, { secret: roomData.moderatorSecret });
			expectValidRoomMemberTokenResponse(
				response,
				roomId,
				MeetRoomMemberRole.MODERATOR,
				false,
				undefined,
				undefined,
				true, // canRetrieveRecordings
				true // canDeleteRecordings
			);
		});

		it(`should generate a room member token without any permissions 
			when using the speaker secret and recording access is admin_moderator`, async () => {
			await updateRecordingAccessConfigInRoom(roomId, MeetRecordingAccess.ADMIN_MODERATOR);

			const response = await generateRoomMemberTokenRequest(roomId, { secret: roomData.speakerSecret });
			expectValidRoomMemberTokenResponse(
				response,
				roomId,
				MeetRoomMemberRole.SPEAKER,
				false,
				undefined,
				undefined,
				false, // canRetrieveRecordings
				false // canDeleteRecordings
			);
		});

		it(`should generate a room member token without any permissions 
			when using the moderator secret and recording access is admin`, async () => {
			await updateRecordingAccessConfigInRoom(roomId, MeetRecordingAccess.ADMIN);

			const response = await generateRoomMemberTokenRequest(roomId, { secret: roomData.moderatorSecret });
			expectValidRoomMemberTokenResponse(
				response,
				roomId,
				MeetRoomMemberRole.MODERATOR,
				false,
				undefined,
				undefined,
				false, // canRetrieveRecordings
				false // canDeleteRecordings
			);
		});

		it(`should generate a room member token without any permissions 
			when using the speaker secret and recording access is admin`, async () => {
			await updateRecordingAccessConfigInRoom(roomId, MeetRecordingAccess.ADMIN);

			const response = await generateRoomMemberTokenRequest(roomId, { secret: roomData.speakerSecret });
			expectValidRoomMemberTokenResponse(
				response,
				roomId,
				MeetRoomMemberRole.SPEAKER,
				false,
				undefined,
				undefined,
				false, // canRetrieveRecordings
				false // canDeleteRecordings
			);
		});
	});

	describe('Generate Room Member Token Validation Tests', () => {
		it('should fail when secret is not provided', async () => {
			const response = await generateRoomMemberTokenRequest(
				roomData.room.roomId,
				{} as unknown as MeetRoomMemberTokenOptions
			);
			expectValidationError(response, 'secret', 'Required');
		});

		it('should fail when secret is empty', async () => {
			const response = await generateRoomMemberTokenRequest(roomData.room.roomId, {
				secret: ''
			});
			expectValidationError(response, 'secret', 'Secret is required');
		});

		it('should fail when grantJoinMeetingPermission is not a boolean', async () => {
			const response = await generateRoomMemberTokenRequest(roomData.room.roomId, {
				secret: roomData.moderatorSecret,
				grantJoinMeetingPermission: 'not-a-boolean' as unknown as boolean
			});
			expectValidationError(response, 'grantJoinMeetingPermission', 'Expected boolean');
		});

		it('should fail when grantJoinMeetingPermission is true but participantName is not provided', async () => {
			const response = await generateRoomMemberTokenRequest(roomData.room.roomId, {
				secret: roomData.moderatorSecret,
				grantJoinMeetingPermission: true
			});
			expectValidationError(
				response,
				'participantName',
				'participantName is required when grantJoinMeetingPermission is true'
			);
		});
	});
});
