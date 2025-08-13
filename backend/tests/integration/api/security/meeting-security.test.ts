import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { LIVEKIT_URL, MEET_API_KEY } from '../../../../src/environment.js';
import { MeetTokenMetadata, ParticipantRole } from '../../../../src/typings/ce';
import { getPermissions } from '../../../helpers/assertion-helpers.js';
import {
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
	let adminCookie: string;
	let roomData: RoomData;

	beforeAll(async () => {
		app = startTestServer();
		adminCookie = await loginUser();
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
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should fail when user is authenticated as admin', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set('Cookie', adminCookie);
			expect(response.status).toBe(401);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set('Cookie', roomData.moderatorCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set('Cookie', newRoomData.moderatorCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is speaker', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}`)
				.set('Cookie', roomData.speakerCookie)
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
				.patch(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
				.send({ role });
			expect(response.status).toBe(401);
		});

		it('should fail when user is authenticated as admin', async () => {
			const response = await request(app)
				.patch(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}`)
				.set('Cookie', adminCookie)
				.send({ role });
			expect(response.status).toBe(401);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.patch(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}`)
				.set('Cookie', roomData.moderatorCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR)
				.send({ role });
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.patch(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}`)
				.set('Cookie', newRoomData.moderatorCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR)
				.send({ role });
			expect(response.status).toBe(403);
		});

		it('should fail when participant is speaker', async () => {
			const response = await request(app)
				.patch(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_NAME}`)
				.set('Cookie', roomData.speakerCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.SPEAKER)
				.send({ role });
			expect(response.status).toBe(403);
		});
	});

	describe('Delete Participant from Meeting Tests', () => {
		const PARTICIPANT_IDENTITY = 'TEST_PARTICIPANT';

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should fail when user is authenticated as admin', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set('Cookie', adminCookie);
			expect(response.status).toBe(401);
		});

		it('should succeed when participant is moderator', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set('Cookie', roomData.moderatorCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(200);
		});

		it('should fail when participant is moderator of a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set('Cookie', newRoomData.moderatorCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.MODERATOR);
			expect(response.status).toBe(403);
		});

		it('should fail when participant is speaker', async () => {
			const response = await request(app)
				.delete(`${MEETINGS_PATH}/${roomData.room.roomId}/participants/${PARTICIPANT_IDENTITY}`)
				.set('Cookie', roomData.speakerCookie)
				.set(INTERNAL_CONFIG.PARTICIPANT_ROLE_HEADER, ParticipantRole.SPEAKER);
			expect(response.status).toBe(403);
		});
	});
});
