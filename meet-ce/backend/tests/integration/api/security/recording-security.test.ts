import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { expectValidStartRecordingResponse } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	deleteAllUsers,
	disconnectFakeParticipants,
	getFullPath,
	getRecordingAccessSecret,
	startRecording,
	startTestServer,
	stopAllRecordings
} from '../../../helpers/request-helpers.js';
import {
	setupCompletedRecording,
	setupRoomMember,
	setupSingleRoom,
	setupSingleRoomWithRecording,
	setupTestUsers,
	setupTestUsersForRoom,
	updateRoomMemberPermissions
} from '../../../helpers/test-scenarios.js';
import { RoomData, RoomMemberData, RoomTestUsers, TestUsers } from '../../../interfaces/scenarios.js';

const RECORDINGS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/recordings`);

describe('Recording API Security Tests', () => {
	let app: Express;
	let testUsers: TestUsers;

	beforeAll(async () => {
		app = await startTestServer();
		testUsers = await setupTestUsers();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
		await deleteAllUsers();
	});

	describe('Start Recording Tests', () => {
		let roomData: RoomData;
		let roomId: string;
		let roomMember: RoomMemberData;

		beforeAll(async () => {
			roomData = await setupSingleRoom(true);
			roomId = roomData.room.roomId;
			roomMember = await setupRoomMember(roomId, {
				name: 'External Member',
				baseRole: MeetRoomMemberRole.MODERATOR
			});
		});

		afterEach(async () => {
			await stopAllRecordings();
		});

		it('should success when request includes API key', async () => {
			const response = await request(app)
				.post(RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expect(response.status).toBe(201);
		});

		it('should fail when using access token', async () => {
			const response = await request(app)
				.post(RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expect(response.status).toBe(401);
		});

		it('should succeed when using room member token with canRecord permission', async () => {
			// Update room member to have canRecord permission
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, { canRecord: true });

			const response = await request(app)
				.post(RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(201);
		});

		it('should fail when using room member token without canRecord permission', async () => {
			// Update room member to not have canRecord permission
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, { canRecord: false });

			const response = await request(app)
				.post(RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(403);
		});

		it('should fail when using room member token from a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.post(RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
			expect(response.status).toBe(403);
		});
	});

	describe('Stop Recording Tests', () => {
		let roomData: RoomData;
		let recordingId: string;
		let roomMember: RoomMemberData;

		beforeAll(async () => {
			roomData = await setupSingleRoomWithRecording();
			recordingId = roomData.recordingId!;
			roomMember = await setupRoomMember(roomData.room.roomId, {
				name: 'External Member',
				baseRole: MeetRoomMemberRole.MODERATOR
			});
		});

		afterAll(async () => {
			await stopAllRecordings();
		});

		it('should success when request includes API key', async () => {
			const response = await request(app)
				.post(`${RECORDINGS_PATH}/${recordingId}/stop`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);

			expect(response.status).toBe(202);

			// Recreate recording for next tests since it was stopped
			const startResponse = await startRecording(roomData.room.roomId);
			expectValidStartRecordingResponse(startResponse, roomData.room.roomId, roomData.room.roomName);
			roomData.recordingId = startResponse.body.recordingId;
		});

		it('should fail when using access token', async () => {
			const response = await request(app)
				.post(`${RECORDINGS_PATH}/${recordingId}/stop`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expect(response.status).toBe(401);
		});

		it('should succeed when using room member token with canRecord permission', async () => {
			// Update room member to have canRecord permission
			roomMember = await updateRoomMemberPermissions(roomData.room.roomId, roomMember.member.memberId, {
				canRecord: true
			});

			const response = await request(app)
				.post(`${RECORDINGS_PATH}/${recordingId}/stop`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(202);

			// Recreate recording for next tests since it was stopped
			const startResponse = await startRecording(roomData.room.roomId);
			expectValidStartRecordingResponse(startResponse, roomData.room.roomId, roomData.room.roomName);
			roomData.recordingId = startResponse.body.recordingId;
		});

		it('should fail when using room member token without canRecord permission', async () => {
			// Update room member to not have canRecord permission
			roomMember = await updateRoomMemberPermissions(roomData.room.roomId, roomMember.member.memberId, {
				canRecord: false
			});

			const response = await request(app)
				.post(`${RECORDINGS_PATH}/${recordingId}/stop`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(403);
		});

		it('should fail when using room member token from a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.post(`${RECORDINGS_PATH}/${recordingId}/stop`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
			expect(response.status).toBe(403);
		});
	});

	describe('Recording Resource Operations', () => {
		let roomData: RoomData;
		let roomId: string;
		let roomUsers: RoomTestUsers;
		let recordingId: string;
		let roomMember: RoomMemberData;

		beforeAll(async () => {
			// Ensure no recordings exist before starting tests
			await deleteAllRecordings();

			roomData = await setupSingleRoomWithRecording(true);
			roomData = await setupTestUsersForRoom(roomData);
			roomId = roomData.room.roomId;
			roomUsers = roomData.users!;
			recordingId = roomData.recordingId!;

			roomMember = await setupRoomMember(roomId, {
				name: 'External Member',
				baseRole: MeetRoomMemberRole.MODERATOR
			});
		});

		describe('Get Recordings Tests', () => {
			it('should succeed when request includes API key', async () => {
				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(1);
			});

			it('should succeed when user is authenticated as ADMIN', async () => {
				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(1);
			});

			it('should succeed when user is authenticated as USER and is room owner', async () => {
				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(1);
			});

			it('should succeed when user is authenticated as USER and is room member with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canRetrieveRecordings: true },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(1);
			});

			it('should not return recordings when user is authenticated as USER and is room member without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canRetrieveRecordings: false },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(0);
			});

			it('should not return recordings when user is authenticated as USER without access to the room', async () => {
				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(0);
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canRetrieveRecordings: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(1);
			});

			it('should not return recordings when user is authenticated as ROOM_MEMBER and is room member without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canRetrieveRecordings: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(0);
			});

			it('should not return recordings when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(0);
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app).get(RECORDINGS_PATH);
				expect(response.status).toBe(401);
			});

			it('should succeed when using room member token with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRetrieveRecordings: true
				});

				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(1);
			});

			it('should not return recordings when using room member token without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRetrieveRecordings: false
				});

				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(0);
			});

			it('should not return recordings when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();
				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(0);
			});

			it('should fail when using recording access secret', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app).get(RECORDINGS_PATH).query({ secret });
				expect(response.status).toBe(401);
			});
		});

		describe('Get Recording Tests', () => {
			it('should succeed when request includes API key', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as ADMIN', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as USER and is room owner', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as USER and is room member with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canRetrieveRecordings: true },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as USER and is room member without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canRetrieveRecordings: false },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(403);
			});

			it('should fail when user is authenticated as USER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
				expect(response.status).toBe(403);
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canRetrieveRecordings: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canRetrieveRecordings: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(403);
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expect(response.status).toBe(403);
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`);
				expect(response.status).toBe(401);
			});

			it('should succeed when using room member token with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRetrieveRecordings: true
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using room member token without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRetrieveRecordings: false
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(403);
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expect(response.status).toBe(403);
			});

			it('should succeed when using public access secret and user is not authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).query({ secret });
				expect(response.status).toBe(200);
			});

			it('should fail when using private access secret and user is not authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, true);
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).query({ secret });
				expect(response.status).toBe(401);
			});

			it('should succeed when using private access secret and user is authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, true);
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.query({ secret })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using invalid access secret', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.query({ secret: 'invalidSecret' });
				expect(response.status).toBe(400);
			});
		});

		describe('Delete Recording Tests', () => {
			it('should succeed when using API key', async () => {
				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should succeed when user is authenticated as ADMIN', async () => {
				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should succeed when user is authenticated as USER and is room owner', async () => {
				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should succeed when user is authenticated as USER and is room member with canDeleteRecordings permission', async () => {
				// Update room member to have canDeleteRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canDeleteRecordings: true },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should fail when user is authenticated as USER and is room member without canDeleteRecordings permission', async () => {
				// Update room member to not have canDeleteRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canDeleteRecordings: false },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(403);
				// No need to recreate - recording was not deleted
			});

			it('should fail when user is authenticated as USER without access to the room', async () => {
				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
				expect(response.status).toBe(403);
				// No need to recreate - recording was not deleted
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with canDeleteRecordings permission', async () => {
				// Update room member to have canDeleteRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canDeleteRecordings: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without canDeleteRecordings permission', async () => {
				// Update room member to not have canDeleteRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canDeleteRecordings: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(403);
				// No need to recreate - recording was not deleted
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expect(response.status).toBe(403);
				// No need to recreate - recording was not deleted
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app).delete(`${RECORDINGS_PATH}/${recordingId}`);
				expect(response.status).toBe(401);
				// No need to recreate - recording was not deleted
			});

			it('should succeed when using room member token with canDeleteRecordings permission', async () => {
				// Update room member to have canDeleteRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canDeleteRecordings: true
				});

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should fail when using room member token without canDeleteRecordings permission', async () => {
				// Update room member to not have canDeleteRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canDeleteRecordings: false
				});

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(403);
				// No need to recreate - recording was not deleted
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expect(response.status).toBe(403);
				// No need to recreate - recording was not deleted
			});

			it('should fail when using recording access secret', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app).delete(`${RECORDINGS_PATH}/${recordingId}`).query({ secret });
				expect(response.status).toBe(401);
				// No need to recreate - recording was not deleted
			});
		});

		describe('Bulk Delete Recordings Tests', () => {
			it('should succeed when using API key', async () => {
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should succeed when user is authenticated as ADMIN', async () => {
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should succeed when user is authenticated as USER and is room owner', async () => {
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should succeed when user is authenticated as USER and is room member with canDeleteRecordings permission', async () => {
				// Update room member to have canDeleteRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canDeleteRecordings: true },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should fail when user is authenticated as USER and is room member without canDeleteRecordings permission', async () => {
				// Update room member to not have canDeleteRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canDeleteRecordings: false },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(400);
				// No need to recreate - recording was not deleted
			});

			it('should fail when user is authenticated as USER without access to the room', async () => {
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
				expect(response.status).toBe(400);
				// No need to recreate - recording was not deleted
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with canDeleteRecordings permission', async () => {
				// Update room member to have canDeleteRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canDeleteRecordings: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without canDeleteRecordings permission', async () => {
				// Update room member to not have canDeleteRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canDeleteRecordings: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(400);
				// No need to recreate - recording was not deleted
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expect(response.status).toBe(400);
				// No need to recreate - recording was not deleted
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app).delete(RECORDINGS_PATH).query({ recordingIds: recordingId });
				expect(response.status).toBe(401);
				// No need to recreate - recording was not deleted
			});

			it('should succeed when using room member token with canDeleteRecordings permission', async () => {
				// Update room member to have canDeleteRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canDeleteRecordings: true
				});

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should fail when using room member token without canDeleteRecordings permission', async () => {
				// Update room member to not have canDeleteRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canDeleteRecordings: false
				});

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(400);
				// No need to recreate - recording was not deleted
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expect(response.status).toBe(400);
				// No need to recreate - recording was not deleted
			});

			it('should fail when using recording access secret', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId, secret });
				expect(response.status).toBe(401);
				// No need to recreate - recording was not deleted
			});
		});

		describe('Get Recording Media Tests', () => {
			it('should succeed when using API key', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as ADMIN', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as USER and is room owner', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as USER and is room member with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canRetrieveRecordings: true },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as USER and is room member without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canRetrieveRecordings: false },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(403);
			});

			it('should fail when user is authenticated as USER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
				expect(response.status).toBe(403);
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canRetrieveRecordings: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canRetrieveRecordings: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(403);
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expect(response.status).toBe(403);
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/media`);
				expect(response.status).toBe(401);
			});

			it('should succeed when using room member token with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRetrieveRecordings: true
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using room member token without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRetrieveRecordings: false
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(403);
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expect(response.status).toBe(403);
			});

			it('should succeed when using public access secret and user is not authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/media`).query({ secret });
				expect(response.status).toBe(200);
			});

			it('should fail when using private access secret and user is not authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, true);
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/media`).query({ secret });
				expect(response.status).toBe(401);
			});

			it('should succeed when using private access secret and user is authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, true);
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.query({ secret })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using invalid access secret', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.query({ secret: 'invalidSecret' });
				expect(response.status).toBe(400);
			});
		});

		describe('Get Recording URL Tests', () => {
			it('should succeed when using API key', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as ADMIN', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as USER and is room owner', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as USER and is room member with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canRetrieveRecordings: true },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as USER and is room member without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canRetrieveRecordings: false },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(403);
			});

			it('should fail when user is authenticated as USER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
				expect(response.status).toBe(403);
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canRetrieveRecordings: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canRetrieveRecordings: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(403);
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expect(response.status).toBe(403);
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/url`);
				expect(response.status).toBe(401);
			});

			it('should succeed when using room member token with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRetrieveRecordings: true
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using room member token without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRetrieveRecordings: false
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(403);
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expect(response.status).toBe(403);
			});

			it('should fail when using recording access secret', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/url`).query({ secret });
				expect(response.status).toBe(401);
			});
		});

		describe('Download Recordings as ZIP Tests', () => {
			it('should succeed when using API key', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as ADMIN', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as USER and is room owner', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as USER and is room member with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canRetrieveRecordings: true },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as USER and is room member without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomUsers.userMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.userMemberDetails.member.memberId,
					{ canRetrieveRecordings: false },
					roomUsers.userMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
				expect(response.status).toBe(400);
			});

			it('should fail when user is authenticated as USER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
				expect(response.status).toBe(400);
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canRetrieveRecordings: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ canRetrieveRecordings: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(400);
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expect(response.status).toBe(400);
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId });
				expect(response.status).toBe(401);
			});

			it('should succeed when using room member token with canRetrieveRecordings permission', async () => {
				// Update room member to have canRetrieveRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRetrieveRecordings: true
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using room member token without canRetrieveRecordings permission', async () => {
				// Update room member to not have canRetrieveRecordings permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRetrieveRecordings: false
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(400);
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expect(response.status).toBe(400);
			});

			it('should fail when using recording access secret', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId, secret });
				expect(response.status).toBe(401);
			});
		});
	});
});
