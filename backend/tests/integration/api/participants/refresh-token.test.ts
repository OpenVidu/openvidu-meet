import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { AuthTransportMode } from '../../../../src/typings/ce/index.js';
import { ParticipantRole } from '../../../../src/typings/ce/participant.js';
import { expectValidationError, expectValidParticipantTokenResponse } from '../../../helpers/assertion-helpers.js';
import {
	changeAuthTransportMode,
	deleteAllRooms,
	disconnectFakeParticipants,
	extractCookieFromHeaders,
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
					secret: roomData.moderatorSecret,
					participantName,
					participantIdentity: participantName
				},
				roomData.moderatorToken
			);
			expectValidParticipantTokenResponse(
				response,
				roomData.room.roomId,
				ParticipantRole.MODERATOR,
				participantName,
				participantName
			);
		});

		it('should refresh participant token with speaker permissions when using the speaker secret', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					secret: roomData.speakerSecret,
					participantName,
					participantIdentity: participantName
				},
				roomData.speakerToken
			);
			expectValidParticipantTokenResponse(
				response,
				roomData.room.roomId,
				ParticipantRole.SPEAKER,
				participantName,
				participantName
			);
		});

		it('should refresh participant token and store it in a cookie when in cookie mode', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Create a new room to obtain participant token in cookie mode
			const newRoomData = await setupSingleRoom(true);

			// Refresh the participant token
			const response = await refreshParticipantToken(
				{
					roomId: newRoomData.room.roomId,
					secret: newRoomData.moderatorSecret,
					participantName,
					participantIdentity: participantName
				},
				newRoomData.moderatorToken
			);
			expectValidParticipantTokenResponse(
				response,
				newRoomData.room.roomId,
				ParticipantRole.MODERATOR,
				participantName,
				participantName
			);

			// Check that the token is included in a cookie
			const participantTokenCookie = extractCookieFromHeaders(
				response,
				INTERNAL_CONFIG.PARTICIPANT_TOKEN_COOKIE_NAME
			);
			expect(participantTokenCookie).toBeDefined();
			expect(participantTokenCookie).toContain(response.body.token);
			expect(participantTokenCookie).toContain('HttpOnly');
			expect(participantTokenCookie).toContain('SameSite=None');
			expect(participantTokenCookie).toContain('Secure');
			expect(participantTokenCookie).toContain('Path=/');

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail with 400 when secret is invalid', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					secret: 'invalid_secret',
					participantName,
					participantIdentity: participantName
				},
				roomData.moderatorToken
			);
			expect(response.status).toBe(400);
		});

		it('should fail with 400 when previous token is not provided', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					secret: roomData.moderatorSecret,
					participantName,
					participantIdentity: participantName
				},
				''
			);
			expect(response.status).toBe(400);
			expect(response.body.message).toBe('No participant token provided');
		});

		it('should fail with 400 when participantIdentity is not provided', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					secret: 'invalid_secret',
					participantName
				},
				roomData.moderatorToken
			);
			expect(response.status).toBe(400);
		});

		it('should fail with 404 when participant does not exist in the room', async () => {
			const newRoomData = await setupSingleRoom();
			const response = await refreshParticipantToken(
				{
					roomId: newRoomData.room.roomId,
					secret: newRoomData.moderatorSecret,
					participantName,
					participantIdentity: participantName
				},
				roomData.moderatorToken
			);
			expect(response.status).toBe(404);
		});

		it('should fail with 404 when room does not exist', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: 'non_existent_room',
					secret: roomData.moderatorSecret,
					participantName,
					participantIdentity: participantName
				},
				roomData.moderatorToken
			);
			expect(response.status).toBe(404);
		});
	});

	describe('Refresh Participant Token Validation Tests', () => {
		it('should fail when roomId is not provided', async () => {
			const response = await refreshParticipantToken(
				{
					secret: roomData.moderatorSecret,
					participantName,
					participantIdentity: participantName
				},
				roomData.moderatorToken
			);
			expectValidationError(response, 'roomId', 'Required');
		});

		it('should fail when secret is not provided', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					participantName,
					participantIdentity: participantName
				},
				roomData.moderatorToken
			);
			expectValidationError(response, 'secret', 'Required');
		});

		it('should fail when secret is empty', async () => {
			const response = await refreshParticipantToken(
				{
					roomId: roomData.room.roomId,
					secret: '',
					participantName,
					participantIdentity: participantName
				},
				roomData.moderatorToken
			);
			expectValidationError(response, 'secret', 'Secret is required');
		});
	});
});
