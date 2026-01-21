import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole, MeetRoomStatus } from '@openvidu-meet/typings';
import { expectValidationError, expectValidRoomMemberTokenResponse } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRooms,
	disconnectFakeParticipants,
	endMeeting,
	generateRoomMemberTokenRequest,
	startTestServer,
	updateRoomStatus
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';

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

		it('should generate a room member token without join meeting permission when not specifying joinMeeting', async () => {
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret
			});
			expectValidRoomMemberTokenResponse(response, roomId, MeetRoomMemberRole.MODERATOR, false);
		});

		it('should generate a room member token to join meeting when specifying joinMeeting true and participantName', async () => {
			const participantName = 'TEST_PARTICIPANT';
			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName
			});
			expectValidRoomMemberTokenResponse(
				response,
				roomId,
				MeetRoomMemberRole.MODERATOR,
				true,
				participantName,
				'test_participant'
			);

			// End the meeting for further tests
			await endMeeting(roomId, roomData.moderatorToken);
		});

		it('should success when specifying joinMeeting true and participant already exists in the room', async () => {
			const participantName = 'TEST_PARTICIPANT';

			// Create token for the first participant
			let response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName
			});
			expectValidRoomMemberTokenResponse(
				response,
				roomId,
				MeetRoomMemberRole.MODERATOR,
				true,
				participantName,
				'test_participant'
			);

			// Create token for the second participant with the same name
			response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName
			});
			expectValidRoomMemberTokenResponse(
				response,
				roomId,
				MeetRoomMemberRole.MODERATOR,
				true,
				participantName + '_1', // Participant name should be unique
				'test_participant_1'
			);

			// End the meeting for further tests
			await endMeeting(roomId, roomData.moderatorToken);
		});

		it('should refresh a room member token to join meeting for an existing participant', async () => {
			const participantName = 'TEST_PARTICIPANT';

			// Create room with initial participant
			const roomWithParticipant = await setupSingleRoom(true);

			// Refresh token for the participant by specifying participantIdentity
			const response = await generateRoomMemberTokenRequest(roomWithParticipant.room.roomId, {
				secret: roomWithParticipant.moderatorSecret,
				joinMeeting: true,
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

		it('should fail with 409 when generating a room member token to join meeting and room is closed', async () => {
			// Close the room
			await updateRoomStatus(roomId, MeetRoomStatus.CLOSED);

			const response = await generateRoomMemberTokenRequest(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
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
				joinMeeting: true,
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

	describe('Generate Room Member Token Validation Tests', () => {
		it('should fail when joinMeeting is not a boolean', async () => {
			const response = await generateRoomMemberTokenRequest(roomData.room.roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: 'not-a-boolean' as unknown as boolean
			});
			expectValidationError(response, 'joinMeeting', 'Expected boolean');
		});

		it('should fail when joinMeeting is true but participantName is not provided', async () => {
			const response = await generateRoomMemberTokenRequest(roomData.room.roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true
			});
			expectValidationError(response, 'participantName', 'participantName is required when joinMeeting is true');
		});
	});
});
