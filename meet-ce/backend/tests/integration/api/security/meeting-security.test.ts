import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole, MeetRoomMemberTokenMetadata } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { getPermissions } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRooms,
	disconnectFakeParticipants,
	loginUser,
	startTestServer,
	updateParticipantMetadata
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';

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
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
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
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is speaker', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.speakerToken);
			expect(response.status).toBe(403);
		});
	});

	describe('Update Participant in Meeting Tests', () => {
		const PARTICIPANT_NAME = 'TEST_PARTICIPANT';
		const role = MeetRoomMemberRole.MODERATOR;

		beforeEach(async () => {
			const metadata: MeetRoomMemberTokenMetadata = {
				livekitUrl: MEET_ENV.LIVEKIT_URL,
				role: MeetRoomMemberRole.SPEAKER,
				permissions: getPermissions(roomData.room.roomId, MeetRoomMemberRole.SPEAKER, true, true).meet
			};
			await updateParticipantMetadata(roomData.room.roomId, PARTICIPANT_NAME, metadata);
		});

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}/role`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
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
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken)
				.send({ role });
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}/role`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken)
				.send({ role });
			expect(response.status).toBe(403);
		});

		it('should fail when participant is speaker', async () => {
			const response = await request(app)
				.put(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}/role`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.speakerToken)
				.send({ role });
			expect(response.status).toBe(403);
		});
	});

	describe('Kick Participant from Meeting Tests', () => {
		const PARTICIPANT_IDENTITY = 'TEST_PARTICIPANT';

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
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
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is speaker', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.speakerToken);
			expect(response.status).toBe(403);
		});
	});
});
