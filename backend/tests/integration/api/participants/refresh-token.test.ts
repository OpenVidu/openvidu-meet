import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { ParticipantRole } from '../../../../src/typings/ce/participant.js';
import { expectValidationError, expectValidParticipantTokenResponse } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRooms,
	disconnectFakeParticipants,
	refreshParticipantToken,
	sleep,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

const participantName = 'TEST_PARTICIPANT';

describe('Participant API Tests', () => {
	let roomData: RoomData;

	beforeAll(async () => {
		startTestServer();

		// Set short expiration for testing
		const initialTokenExpiration = INTERNAL_CONFIG.PARTICIPANT_TOKEN_EXPIRATION;
		INTERNAL_CONFIG.PARTICIPANT_TOKEN_EXPIRATION = '1s';

		roomData = await setupSingleRoom(true);
		await sleep('2s'); // Ensure the token is expired

		// Restore original expiration after setup
		INTERNAL_CONFIG.PARTICIPANT_TOKEN_EXPIRATION = initialTokenExpiration;
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Refresh Participant Token Tests', () => {
		it('should refresh participant token with moderator permissions when using the moderator secret', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					participantName,
					secret: roomData.moderatorSecret
				},
				roomData.moderatorCookie
			);
			expectValidParticipantTokenResponse(
				response,
				roomData.room.roomId,
				participantName,
				ParticipantRole.MODERATOR
			);
		});

		it('should refresh participant token with publisher permissions when using the publisher secret', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					participantName,
					secret: roomData.publisherSecret
				},
				roomData.publisherCookie
			);
			expectValidParticipantTokenResponse(
				response,
				roomData.room.roomId,
				participantName,
				ParticipantRole.PUBLISHER
			);
		});

		it('should fail with 400 when secret is invalid', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					participantName,
					secret: 'invalid_secret'
				},
				roomData.moderatorCookie
			);
			expect(response.status).toBe(400);
		});

		it('should fail with 400 when previous token is not provided', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					participantName,
					secret: roomData.moderatorSecret
				},
				''
			);
			expect(response.status).toBe(400);
			expect(response.body.message).toBe('No participant token provided');
		});

		it('should fail with 404 when participant does not exist in the room', async () => {
			const newRoomData = await setupSingleRoom();
			const response = await refreshParticipantToken(
				{
					roomId: newRoomData.room.roomId,
					participantName,
					secret: newRoomData.moderatorSecret
				},
				roomData.moderatorCookie
			);
			expect(response.status).toBe(404);
		});

		it('should fail with 404 when room does not exist', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: 'non_existent_room',
					participantName,
					secret: roomData.moderatorSecret
				},
				roomData.moderatorCookie
			);
			expect(response.status).toBe(404);
		});

		it('should fail with 409 when participant token is still valid', async () => {
			const newRoomData = await setupSingleRoom(true);
			const response = await refreshParticipantToken(
				{
					roomId: newRoomData.room.roomId,
					participantName,
					secret: newRoomData.moderatorSecret
				},
				newRoomData.moderatorCookie
			);
			expect(response.status).toBe(409);
			expect(response.body.message).toBe('Participant token is still valid');
		});
	});

	describe('Refresh Participant Token Validation Tests', () => {
		it('should fail when roomId is not provided', async () => {
			const response = await refreshParticipantToken(
				{
					participantName,
					secret: roomData.moderatorSecret
				},
				roomData.moderatorCookie
			);
			expectValidationError(response, 'roomId', 'Required');
		});

		it('should fail when participantName is not provided', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret
				},
				roomData.moderatorCookie
			);
			expectValidationError(response, 'participantName', 'Required');
		});

		it('should fail when secret is not provided', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					participantName
				},
				roomData.moderatorCookie
			);
			expectValidationError(response, 'secret', 'Required');
		});

		it('should fail when participantName is empty', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					participantName: '',
					secret: roomData.moderatorSecret
				},
				roomData.moderatorCookie
			);
			expectValidationError(response, 'participantName', 'Participant name is required');
		});

		it('should fail when secret is empty', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					participantName,
					secret: ''
				},
				roomData.moderatorCookie
			);
			expectValidationError(response, 'secret', 'Secret is required');
		});
	});
});
