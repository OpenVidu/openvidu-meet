import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { LIVEKIT_URL, MEET_INITIAL_API_KEY } from '../../../../src/environment.js';
import { AuthTransportMode, MeetTokenMetadata, ParticipantRole } from '@openvidu-meet/typings';
import { getPermissions } from '../../../helpers/assertion-helpers.js';
import {
	changeAuthTransportMode,
	deleteAllRooms,
	disconnectFakeParticipants,
	loginUser,
	startTestServer,
	updateParticipantMetadata
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

const MEETINGS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings`;

describe('Meeting API Security Tests', () => {
	let app: Express;
	let adminAccessToken: string;
	let roomData: RoomData;

	beforeAll(async () => {
		app = await startTestServer();
		adminAccessToken = await loginUser();
	});

	beforeEach(async () => {
		roomData = await setupSingleRoom(true);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('End Meeting Tests', () => {
		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should fail when user is authenticated as admin', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(401);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(200);
		});

		it('should succeed when participant is moderator and token is sent in cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Create a new room to obtain participant token in cookie mode
			const newRoomData = await setupSingleRoom(true);

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${newRoomData.room.roomId}`)
				.set('Cookie', newRoomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, newRoomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is speaker', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.speakerToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.SPEAKER);
			expect(response.status).toBe(403);
		});
	});

	describe('Update Participant in Meeting Tests', () => {
		const PARTICIPANT_NAME = 'TEST_PARTICIPANT';
		const role = ParticipantRole.MODERATOR;

		beforeEach(async () => {
			const metadata: MeetTokenMetadata = {
				livekitUrl: LIVEKIT_URL,
				roles: [
					{
						role: ParticipantRole.SPEAKER,
						permissions: getPermissions(roomData.room.roomId, ParticipantRole.SPEAKER).openvidu
					}
				],
				selectedRole: ParticipantRole.SPEAKER
			};
			await updateParticipantMetadata(roomData.room.roomId, PARTICIPANT_NAME, metadata);
		});

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}/role`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send({ role });
			expect(response.status).toBe(401);
		});

		it('should fail when user is authenticated as admin', async () => {
			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}/role`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.send({ role });
			expect(response.status).toBe(401);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}/role`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR)
				.send({ role });
			expect(response.status).toBe(200);
		});

		it('should succeed when participant is moderator and token is sent in cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Create a new room to obtain participant token in cookie mode
			const newRoomData = await setupSingleRoom(true);
			await updateParticipantMetadata(newRoomData.room.roomId, PARTICIPANT_NAME, {
				livekitUrl: LIVEKIT_URL,
				roles: [
					{
						role: ParticipantRole.SPEAKER,
						permissions: getPermissions(newRoomData.room.roomId, ParticipantRole.SPEAKER).openvidu
					}
				],
				selectedRole: ParticipantRole.SPEAKER
			});

			const response = await request(app)
				.put(`${MEETINGS_PATH}/${newRoomData.room.roomId}/participants/${PARTICIPANT_NAME}/role`)
				.set('Cookie', newRoomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR)
				.send({ role });
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}/role`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, newRoomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR)
				.send({ role });
			expect(response.status).toBe(403);
		});

		it('should fail when participant is speaker', async () => {
			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}/role`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.speakerToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.SPEAKER)
				.send({ role });
			expect(response.status).toBe(403);
		});
	});

	describe('Kick Participant from Meeting Tests', () => {
		const PARTICIPANT_IDENTITY = 'TEST_PARTICIPANT';

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should fail when user is authenticated as admin', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(401);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(200);
		});

		it('should succeed when participant is moderator and token is sent in cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Create a new room to obtain participant token in cookie mode
			const newRoomData = await setupSingleRoom(true);

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${newRoomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set('Cookie', newRoomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, newRoomData.moderatorToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is speaker', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set(INTERNAL_CONFIG.PARTICIPANT_TOKEN_HEADER, roomData.speakerToken)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.SPEAKER);
			expect(response.status).toBe(403);
		});
	});
});
