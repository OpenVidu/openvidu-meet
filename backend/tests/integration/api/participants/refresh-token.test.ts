import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ParticipantRole } from '../../../../src/typings/ce/participant.js';
import { expectValidationError, expectValidParticipantTokenResponse } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRooms,
	disconnectFakeParticipants,
	refreshParticipantToken,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

const participantName = 'TEST_PARTICIPANT';

describe('Participant API Tests', () => {
	let roomData: RoomData;

	beforeAll(async () => {
		startTestServer();
		roomData = await setupSingleRoom(true);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Refresh Participant Token Tests', () => {
		it('should refresh participant token with moderator permissions when using the moderator secret', async () => {
			const response = await refreshParticipantToken({
				roomId: roomData.room.roomId,
				participantName,
				secret: roomData.moderatorSecret
			});
			expectValidParticipantTokenResponse(
				response,
				roomData.room.roomId,
				participantName,
				ParticipantRole.MODERATOR
			);
		});

		it('should refresh participant token with publisher permissions when using the publisher secret', async () => {
			const response = await refreshParticipantToken({
				roomId: roomData.room.roomId,
				participantName,
				secret: roomData.publisherSecret
			});
			expectValidParticipantTokenResponse(
				response,
				roomData.room.roomId,
				participantName,
				ParticipantRole.PUBLISHER
			);
		});

		it('should fail with 404 when participant does not exist in the room', async () => {
			roomData = await setupSingleRoom();
			const response = await refreshParticipantToken({
				roomId: roomData.room.roomId,
				participantName,
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(404);

			// Recreate the room with participant
			roomData = await setupSingleRoom(true);
		});

		it('should fail with 404 when room does not exist', async () => {
			const response = await refreshParticipantToken({
				roomId: 'non_existent_room',
				participantName,
				secret: roomData.moderatorSecret
			});
			expect(response.status).toBe(404);
		});

		it('should fail with 400 when secret is invalid', async () => {
			const response = await refreshParticipantToken({
				roomId: roomData.room.roomId,
				participantName,
				secret: 'invalid_secret'
			});
			expect(response.status).toBe(400);
		});
	});

	describe('Refresh Participant Token Validation Tests', () => {
		it('should fail when roomId is not provided', async () => {
			const response = await refreshParticipantToken({
				participantName,
				secret: roomData.moderatorSecret
			});
			expectValidationError(response, 'roomId', 'Required');
		});

		it('should fail when participantName is not provided', async () => {
			const response = await refreshParticipantToken({
				roomId: roomData.room.roomId,
				secret: roomData.moderatorSecret
			});
			expectValidationError(response, 'participantName', 'Required');
		});

		it('should fail when secret is not provided', async () => {
			const response = await refreshParticipantToken({
				roomId: roomData.room.roomId,
				participantName
			});
			expectValidationError(response, 'secret', 'Required');
		});

		it('should fail when participantName is empty', async () => {
			const response = await refreshParticipantToken({
				roomId: roomData.room.roomId,
				participantName: '',
				secret: roomData.moderatorSecret
			});
			expectValidationError(response, 'participantName', 'Participant name is required');
		});

		it('should fail when secret is empty', async () => {
			const response = await refreshParticipantToken({
				roomId: roomData.room.roomId,
				participantName,
				secret: ''
			});
			expectValidationError(response, 'secret', 'Secret is required');
		});
	});
});
