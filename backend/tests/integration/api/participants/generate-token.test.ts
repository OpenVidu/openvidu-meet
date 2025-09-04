import { afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { ParticipantRole } from '../../../../src/typings/ce/participant.js';
import { expectValidationError, expectValidParticipantTokenResponse } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRooms,
	disconnectFakeParticipants,
	endMeeting,
	generateParticipantToken,
	generateParticipantTokenCookie,
	startTestServer,
	updateRoomStatus
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

const participantName = 'TEST_PARTICIPANT';

describe('Participant API Tests', () => {
	let roomData: RoomData;

	beforeAll(async () => {
		startTestServer();
	});

	beforeEach(async () => {
		roomData = await setupSingleRoom();
	});

	// Force to cleanup participant name reservations after each test
	afterEach(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Generate Participant Token Tests', () => {
		it('should generate a participant token without join permissions when not specifying participant name', async () => {
			const response = await generateParticipantToken({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret
			});
			expectValidParticipantTokenResponse(response, roomData.room.roomId, ParticipantRole.MODERATOR);
		});

		it('should generate a participant token with moderator permissions when using the moderator secret', async () => {
			const response = await generateParticipantToken({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName
			});
			expectValidParticipantTokenResponse(
				response,
				roomData.room.roomId,
				ParticipantRole.MODERATOR,
				participantName
			);
		});

		it('should generate a participant token with speaker permissions when using the speaker secret', async () => {
			const response = await generateParticipantToken({
				roomId: roomData.room.roomId,
				secret: roomData.speakerSecret,
				participantName
			});
			expectValidParticipantTokenResponse(
				response,
				roomData.room.roomId,
				ParticipantRole.SPEAKER,
				participantName
			);
		});

		it(`should generate a participant token with both speaker and moderator permissions
			 when using the speaker secret after having a moderator token`, async () => {
			const moderatorCookie = await generateParticipantTokenCookie(
				roomData.room.roomId,
				roomData.moderatorSecret,
				`${participantName}_MODERATOR`
			);
			const speakerResponse = await generateParticipantToken(
				{
					roomId: roomData.room.roomId,
					secret: roomData.speakerSecret,
					participantName: `${participantName}_SPEAKER`
				},
				moderatorCookie
			);
			expectValidParticipantTokenResponse(
				speakerResponse,
				roomData.room.roomId,
				ParticipantRole.SPEAKER,
				`${participantName}_SPEAKER`,
				undefined,
				[ParticipantRole.MODERATOR]
			);
		});

		it('should success when participant already exists in the room', async () => {
			roomData = await setupSingleRoom(true);
			let response = await generateParticipantToken({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName
			});

			// First participant using API. LK CLI participants can reuse the same name.
			expectValidParticipantTokenResponse(
				response,
				roomData.room.roomId,
				ParticipantRole.MODERATOR,
				participantName
			);

			response = await generateParticipantToken({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName
			});

			// Second participant using API, the participant name should be unique
			expectValidParticipantTokenResponse(
				response,
				roomData.room.roomId,
				ParticipantRole.MODERATOR,
				participantName + '_1'
			);

			// Recreate the room without the participant
			roomData = await setupSingleRoom();
		});

		it('should fail with 409 when room is closed', async () => {
			await endMeeting(roomData.room.roomId, roomData.moderatorCookie);
			await updateRoomStatus(roomData.room.roomId, 'closed');
			const response = await generateParticipantToken({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret,
				participantName
			});
			expect(response.status).toBe(409);
		});

		it('should fail with 404 when room does not exist', async () => {
			const response = await generateParticipantToken({
				roomId: 'non_existent_room',
				secret: roomData.moderatorSecret,
				participantName
			});
			expect(response.status).toBe(404);
		});

		it('should fail with 400 when secret is invalid', async () => {
			const response = await generateParticipantToken({
				roomId: roomData.room.roomId,
				secret: 'invalid_secret',
				participantName
			});
			expect(response.status).toBe(400);
		});
	});

	describe('Generate Participant Token Validation Tests', () => {
		it('should fail when roomId is not provided', async () => {
			const response = await generateParticipantToken({
				secret: roomData.moderatorSecret,
				participantName
			});
			expectValidationError(response, 'roomId', 'Required');
		});

		it('should fail when secret is not provided', async () => {
			const response = await generateParticipantToken({
				roomId: roomData.room.roomId,
				participantName
			});
			expectValidationError(response, 'secret', 'Required');
		});

		it('should fail when secret is empty', async () => {
			const response = await generateParticipantToken({
				roomId: roomData.room.roomId,
				secret: '',
				participantName
			});
			expectValidationError(response, 'secret', 'Secret is required');
		});
	});
});
