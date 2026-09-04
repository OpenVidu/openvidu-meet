import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import {
	errorAnonymousAccessDisabled,
	errorInsufficientPermissions,
	errorInvalidRecordingSecret,
	errorRecordingsZipEmpty,
	errorUnauthorized
} from '../../../../src/models/error.model.js';
import {
	expectBulkDenied,
	expectMeetError,
	expectValidStartRecordingResponse
} from '../../../helpers/assertion-helpers.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import { describeInCompatibilityMode } from '../../../helpers/meet-mode-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	deleteAllUsers,
	endMeeting,
	getFullPath,
	getRecording,
	getRecordingAccessSecret,
	sleep,
	startRecording,
	startTestServer,
	stopAllRecordings,
	updateRoomAccessConfig
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
		await deleteAllRooms();
		await deleteAllRecordings();
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
				name: 'Identified Guest',
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
			expectMeetError(response, errorUnauthorized());
		});

		it('should succeed when using room member token with recordingControl permission', async () => {
			// Update room member to have recordingControl permission
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				recordingControl: true
			});

			const response = await request(app)
				.post(RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(201);
		});

		it('should fail when using room member token without recordingControl permission', async () => {
			// Update room member to not have recordingControl permission
			roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
				recordingControl: false
			});

			const response = await request(app)
				.post(RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when using room member token from a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.post(RECORDINGS_PATH)
				.send({ roomId: roomData.room.roomId })
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		describeInCompatibilityMode('Deprecated permission spellings', () => {
			it('should deny starting a recording when canRecord is denied', async () => {
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRecord: false
				});

				const response = await request(app)
					.post(RECORDINGS_PATH)
					.send({ roomId: roomData.room.roomId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(response, errorInsufficientPermissions());
			});
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
				name: 'Identified Guest',
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
			await sleep('2s'); // Ensure recording is fully stopped before starting a new one
			const startResponse = await startRecording(roomData.room.roomId);
			expectValidStartRecordingResponse(startResponse, roomData.room.roomId, roomData.room.roomName);
			recordingId = startResponse.body.recordingId;
		});

		it('should fail when using access token', async () => {
			const response = await request(app)
				.post(`${RECORDINGS_PATH}/${recordingId}/stop`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expectMeetError(response, errorUnauthorized());
		});

		it('should succeed when using room member token with recordingControl permission', async () => {
			// Update room member to have recordingControl permission
			roomMember = await updateRoomMemberPermissions(roomData.room.roomId, roomMember.member.memberId, {
				recordingControl: true
			});

			const response = await request(app)
				.post(`${RECORDINGS_PATH}/${recordingId}/stop`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(202);

			// Recreate recording for next tests since it was stopped
			await sleep('2s'); // Ensure recording is fully stopped before starting a new one
			const startResponse = await startRecording(roomData.room.roomId);
			expectValidStartRecordingResponse(startResponse, roomData.room.roomId, roomData.room.roomName);
			recordingId = startResponse.body.recordingId;
		});

		it('should fail when using room member token without recordingControl permission', async () => {
			// Update room member to not have recordingControl permission
			roomMember = await updateRoomMemberPermissions(roomData.room.roomId, roomMember.member.memberId, {
				recordingControl: false
			});

			const response = await request(app)
				.post(`${RECORDINGS_PATH}/${recordingId}/stop`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when using room member token from a different room', async () => {
			const newRoomData = await setupSingleRoom();

			const response = await request(app)
				.post(`${RECORDINGS_PATH}/${recordingId}/stop`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
			expectMeetError(response, errorInsufficientPermissions());
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
				name: 'Identified Guest',
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

			it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(1);
			});

			it('should succeed when user is authenticated as ROOM_MANAGER and is room member with recordingList permission', async () => {
				// Update room member to have recordingList permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingList: true },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(1);
			});

			it('should not return recordings when user is authenticated as ROOM_MANAGER and is room member without recordingList permission', async () => {
				// Update room member to not have recordingList permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingList: false },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(0);
			});

			it('should not return recordings when user is authenticated as ROOM_MANAGER without access to the room', async () => {
				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(0);
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with recordingList permission', async () => {
				// Update room member to have recordingList permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingList: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(1);
			});

			it('should not return recordings when user is authenticated as ROOM_MEMBER and is room member without recordingList permission', async () => {
				// Update room member to not have recordingList permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingList: false },
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
				expectMeetError(response, errorUnauthorized());
			});

			it('should succeed when using room member token with recordingList permission', async () => {
				// Update room member to have recordingList permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingList: true
				});

				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);
				expect(response.body.recordings.length).toBe(1);
			});

			it('should fail when using room member token without recordingList permission', async () => {
				// Update room member to not have recordingList permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingList: false
				});

				const response = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when using recording access secret', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app).get(RECORDINGS_PATH).query({ recordingSecret: secret });
				expectMeetError(response, errorUnauthorized());
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

			it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as ROOM_MANAGER and is room member with recordingPlay permission', async () => {
				// Update room member to have recordingPlay permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingPlay: true },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MANAGER and is room member without recordingPlay permission', async () => {
				// Update room member to not have recordingPlay permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingPlay: false },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with recordingPlay permission', async () => {
				// Update room member to have recordingPlay permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingPlay: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without recordingPlay permission', async () => {
				// Update room member to not have recordingPlay permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingPlay: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`);
				expectMeetError(response, errorUnauthorized());
			});

			it('should succeed when using room member token with recordingPlay permission', async () => {
				// Update room member to have recordingPlay permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingPlay: true
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using room member token without recordingPlay permission', async () => {
				// Update room member to not have recordingPlay permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingPlay: false
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should succeed when using public access secret and user is not authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.query({ recordingSecret: secret });
				expect(response.status).toBe(200);
			});

			it('should fail when using private access secret and user is not authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, true);
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.query({ recordingSecret: secret });
				expectMeetError(response, errorUnauthorized());
			});

			it('should succeed when using private access secret and user is authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, true);
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.query({ recordingSecret: secret })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using invalid access secret', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.query({ recordingSecret: 'invalidSecret' });
				expectMeetError(response, errorInvalidRecordingSecret(recordingId));
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

			it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should succeed when user is authenticated as ROOM_MANAGER and is room member with recordingDelete permission', async () => {
				// Update room member to have recordingDelete permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingDelete: true },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should fail when user is authenticated as ROOM_MANAGER and is room member without recordingDelete permission', async () => {
				// Update room member to not have recordingDelete permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingDelete: false },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
				expect((await getRecording(recordingId)).status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
				expect((await getRecording(recordingId)).status).toBe(200);
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with recordingDelete permission', async () => {
				// Update room member to have recordingDelete permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingDelete: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without recordingDelete permission', async () => {
				// Update room member to not have recordingDelete permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingDelete: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
				expect((await getRecording(recordingId)).status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
				expect((await getRecording(recordingId)).status).toBe(200);
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app).delete(`${RECORDINGS_PATH}/${recordingId}`);
				expectMeetError(response, errorUnauthorized());
				expect((await getRecording(recordingId)).status).toBe(200);
			});

			it('should succeed when using room member token with recordingDelete permission', async () => {
				// Update room member to have recordingDelete permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingDelete: true
				});

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should fail when using room member token without recordingDelete permission', async () => {
				// Update room member to not have recordingDelete permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingDelete: false
				});

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(response, errorInsufficientPermissions());
				expect((await getRecording(recordingId)).status).toBe(200);
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expectMeetError(response, errorInsufficientPermissions());
				expect((await getRecording(recordingId)).status).toBe(200);
			});

			it('should fail when using recording access secret', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.query({ recordingSecret: secret });
				expectMeetError(response, errorUnauthorized());
				expect((await getRecording(recordingId)).status).toBe(200);
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

			it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should succeed when user is authenticated as ROOM_MANAGER and is room member with recordingDelete permission', async () => {
				// Update room member to have recordingDelete permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingDelete: true },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should fail when user is authenticated as ROOM_MANAGER and is room member without recordingDelete permission', async () => {
				// Update room member to not have recordingDelete permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingDelete: false },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				await expectBulkDenied(response, {
					id: recordingId,
					reason: errorInsufficientPermissions(),
					readBack: () => getRecording(recordingId)
				});
			});

			it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
				await expectBulkDenied(response, {
					id: recordingId,
					reason: errorInsufficientPermissions(),
					readBack: () => getRecording(recordingId)
				});
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with recordingDelete permission', async () => {
				// Update room member to have recordingDelete permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingDelete: true },
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

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without recordingDelete permission', async () => {
				// Update room member to not have recordingDelete permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingDelete: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				await expectBulkDenied(response, {
					id: recordingId,
					reason: errorInsufficientPermissions(),
					readBack: () => getRecording(recordingId)
				});
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				await expectBulkDenied(response, {
					id: recordingId,
					reason: errorInsufficientPermissions(),
					readBack: () => getRecording(recordingId)
				});
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app).delete(RECORDINGS_PATH).query({ recordingIds: recordingId });
				expectMeetError(response, errorUnauthorized());
				expect((await getRecording(recordingId)).status).toBe(200);
			});

			it('should succeed when using room member token with recordingDelete permission', async () => {
				// Update room member to have recordingDelete permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingDelete: true
				});

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);

				// Recreate recording for next tests since it was deleted
				recordingId = await setupCompletedRecording(roomData);
			});

			it('should fail when using room member token without recordingDelete permission', async () => {
				// Update room member to not have recordingDelete permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingDelete: false
				});

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				await expectBulkDenied(response, {
					id: recordingId,
					reason: errorInsufficientPermissions(),
					readBack: () => getRecording(recordingId)
				});
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();

				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				await expectBulkDenied(response, {
					id: recordingId,
					reason: errorInsufficientPermissions(),
					readBack: () => getRecording(recordingId)
				});
			});

			it('should fail when using recording access secret', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app)
					.delete(RECORDINGS_PATH)
					.query({ recordingIds: recordingId, recordingSecret: secret });
				expectMeetError(response, errorUnauthorized());
				expect((await getRecording(recordingId)).status).toBe(200);
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

			it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as ROOM_MANAGER and is room member with recordingPlay permission', async () => {
				// Update room member to have recordingPlay permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingPlay: true },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MANAGER and is room member without recordingPlay permission', async () => {
				// Update room member to not have recordingPlay permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingPlay: false },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with recordingPlay permission', async () => {
				// Update room member to have recordingPlay permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingPlay: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without recordingPlay permission', async () => {
				// Update room member to not have recordingPlay permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingPlay: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/media`);
				expectMeetError(response, errorUnauthorized());
			});

			it('should succeed when using room member token with recordingPlay permission', async () => {
				// Update room member to have recordingPlay permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingPlay: true
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using room member token without recordingPlay permission', async () => {
				// Update room member to not have recordingPlay permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingPlay: false
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should succeed when using public access secret and user is not authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.query({ recordingSecret: secret });
				expect(response.status).toBe(200);
			});

			it('should fail when using private access secret and user is not authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, true);
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.query({ recordingSecret: secret });
				expectMeetError(response, errorUnauthorized());
			});

			it('should succeed when using private access secret and user is authenticated', async () => {
				const secret = await getRecordingAccessSecret(recordingId, true);
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.query({ recordingSecret: secret })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using invalid access secret', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.query({ recordingSecret: 'invalidSecret' });
				expectMeetError(response, errorInvalidRecordingSecret(recordingId));
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

			it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as ROOM_MANAGER and is room member with recordingPlay permission', async () => {
				// Update room member to have recordingPlay permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingPlay: true },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MANAGER and is room member without recordingPlay permission', async () => {
				// Update room member to not have recordingPlay permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingPlay: false },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with recordingPlay permission', async () => {
				// Update room member to have recordingPlay permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingPlay: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without recordingPlay permission', async () => {
				// Update room member to not have recordingPlay permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingPlay: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}/url`);
				expectMeetError(response, errorUnauthorized());
			});

			it('should succeed when using room member token with recordingPlay permission', async () => {
				// Update room member to have recordingPlay permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingPlay: true
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using room member token without recordingPlay permission', async () => {
				// Update room member to not have recordingPlay permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingPlay: false
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expectMeetError(response, errorInsufficientPermissions());
			});

			it('should fail when using recording access secret', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/url`)
					.query({ recordingSecret: secret });
				expectMeetError(response, errorUnauthorized());
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

			it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when user is authenticated as ROOM_MANAGER and is room member with recordingDownload permission', async () => {
				// Update room member to have recordingDownload permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingDownload: true },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MANAGER and is room member without recordingDownload permission', async () => {
				// Update room member to not have recordingDownload permission
				roomUsers.roomManagerMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomManagerMemberDetails.member.memberId,
					{ recordingDownload: false },
					roomUsers.roomManagerMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
				expectMeetError(response, errorRecordingsZipEmpty());
			});

			it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
				expectMeetError(response, errorRecordingsZipEmpty());
			});

			it('should succeed when user is authenticated as ROOM_MEMBER and is room member with recordingDownload permission', async () => {
				// Update room member to have recordingDownload permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingDownload: true },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expect(response.status).toBe(200);
			});

			it('should fail when user is authenticated as ROOM_MEMBER and is room member without recordingDownload permission', async () => {
				// Update room member to not have recordingDownload permission
				roomUsers.roomMemberDetails = await updateRoomMemberPermissions(
					roomId,
					roomUsers.roomMemberDetails.member.memberId,
					{ recordingDownload: false },
					roomUsers.roomMember.accessToken
				);

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
				expectMeetError(response, errorRecordingsZipEmpty());
			});

			it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
				expectMeetError(response, errorRecordingsZipEmpty());
			});

			it('should fail when user is not authenticated', async () => {
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId });
				expectMeetError(response, errorUnauthorized());
			});

			it('should succeed when using room member token with recordingDownload permission', async () => {
				// Update room member to have recordingDownload permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingDownload: true
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(response.status).toBe(200);
			});

			it('should fail when using room member token without recordingDownload permission', async () => {
				// Update room member to not have recordingDownload permission
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingDownload: false
				});

				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(response, errorRecordingsZipEmpty());
			});

			it('should fail when using room member token from a different room', async () => {
				const newRoomData = await setupSingleRoom();
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, newRoomData.moderatorToken);
				expectMeetError(response, errorRecordingsZipEmpty());
			});

			it('should fail when using recording access secret', async () => {
				const secret = await getRecordingAccessSecret(recordingId, false);
				const response = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId, recordingSecret: secret });
				expectMeetError(response, errorUnauthorized());
			});
		});

		// Each block above grants the one capability its own route reads. These combinations are what
		// none of them can show: playback without download, download without playback, and playback
		// without listing.
		describe('Split Recording Permission Gates', () => {
			it('should allow playback but reject download with recordingPlay and no recordingDownload', async () => {
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingList: true,
					recordingPlay: true,
					recordingDownload: false
				});

				const getResponse = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(getResponse.status).toBe(200);

				const mediaResponse = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(mediaResponse.status).toBe(200);

				const downloadResponse = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/download`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(downloadResponse, errorInsufficientPermissions());

				const zipResponse = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(zipResponse, errorRecordingsZipEmpty());
			});

			it('should serve the download as an attachment but reject playback with recordingDownload and no recordingPlay', async () => {
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingList: false,
					recordingPlay: false,
					recordingDownload: true
				});

				const downloadResponse = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/download`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(downloadResponse.status).toBe(200);
				expect(downloadResponse.headers['content-disposition']).toContain('attachment');

				const zipResponse = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(zipResponse.status).toBe(200);

				const mediaResponse = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(mediaResponse, errorInsufficientPermissions());

				const getResponse = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(getResponse, errorInsufficientPermissions());
			});

			it('should hide the recording list while playback still works with recordingPlay and no recordingList', async () => {
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					recordingList: false,
					recordingPlay: true,
					recordingDownload: false
				});

				const listResponse = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(listResponse, errorInsufficientPermissions());

				const mediaResponse = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expect(mediaResponse.status).toBe(200);
			});
		});

		// The deprecated retrieval flag stands for three gates at once, so denying it has to close
		// listing, playback and download together: a rename reaching only one of them leaves the
		// other two open. Only the denial discriminates, since the member's base role is MODERATOR.
		describeInCompatibilityMode('Deprecated permission spellings', () => {
			it('should close listing, playback and download when canRetrieveRecordings is denied', async () => {
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canRetrieveRecordings: false
				});

				const listResponse = await request(app)
					.get(RECORDINGS_PATH)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(listResponse, errorInsufficientPermissions());

				const getResponse = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(getResponse, errorInsufficientPermissions());

				const mediaResponse = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/media`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(mediaResponse, errorInsufficientPermissions());

				const downloadResponse = await request(app)
					.get(`${RECORDINGS_PATH}/${recordingId}/download`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(downloadResponse, errorInsufficientPermissions());

				const zipResponse = await request(app)
					.get(`${RECORDINGS_PATH}/download`)
					.query({ recordingIds: recordingId })
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(zipResponse, errorRecordingsZipEmpty());
			});

			it('should deny deleting a recording when canDeleteRecordings is denied', async () => {
				roomMember = await updateRoomMemberPermissions(roomId, roomMember.member.memberId, {
					canDeleteRecordings: false
				});

				const response = await request(app)
					.delete(`${RECORDINGS_PATH}/${recordingId}`)
					.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
				expectMeetError(response, errorInsufficientPermissions());
				expect((await getRecording(recordingId)).status).toBe(200);
			});
		});
	});

	describe('User Access Recording Resource Operations', () => {
		let roomData: RoomData;
		let roomId: string;
		let recordingId: string;

		beforeAll(async () => {
			// Ensure no recordings exist before starting tests
			await deleteAllRecordings();

			roomData = await setupSingleRoomWithRecording(true);
			roomId = roomData.room.roomId;
			recordingId = roomData.recordingId!;

			// End the meeting
			await disconnectFakeParticipants();
			await endMeeting(roomId, roomData.moderatorToken);

			// Enable user access for the room
			await updateRoomAccessConfig(roomId, {
				user: {
					enabled: true
				}
			});
		});

		it('should return recordings for ROOM_MANAGER when user access is enabled (speaker role has recordingList permission)', async () => {
			const response = await request(app)
				.get(RECORDINGS_PATH)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
			expect(response.status).toBe(200);
			expect(response.body.recordings.length).toBe(1);
			expect(response.body.recordings[0].recordingId).toBe(recordingId);
		});

		it('should return recordings for ROOM_MEMBER when user access is enabled (speaker role has recordingList permission)', async () => {
			const response = await request(app)
				.get(RECORDINGS_PATH)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(200);
			expect(response.body.recordings.length).toBe(1);
			expect(response.body.recordings[0].recordingId).toBe(recordingId);
		});

		it('should retrieve recording for ROOM_MANAGER when user access is enabled (speaker role has recordingPlay permission)', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
			expect(response.status).toBe(200);
		});

		it('should retrieve recording for ROOM_MEMBER when user access is enabled (speaker role has recordingPlay permission)', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(200);
		});

		it('should fail bulk delete for ROOM_MANAGER when user access is enabled (speaker role does not have recordingDelete permission)', async () => {
			const response = await request(app)
				.delete(RECORDINGS_PATH)
				.query({ recordingIds: recordingId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
			await expectBulkDenied(response, {
				id: recordingId,
				reason: errorInsufficientPermissions(),
				readBack: () => getRecording(recordingId)
			});
		});

		it('should fail bulk delete for ROOM_MEMBER when user access is enabled (speaker role does not have recordingDelete permission)', async () => {
			const response = await request(app)
				.delete(RECORDINGS_PATH)
				.query({ recordingIds: recordingId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			await expectBulkDenied(response, {
				id: recordingId,
				reason: errorInsufficientPermissions(),
				readBack: () => getRecording(recordingId)
			});
		});

		it('should get recording media for ROOM_MANAGER when user access is enabled (speaker role has recordingPlay permission)', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
			expect(response.status).toBe(200);
		});

		it('should get recording media for ROOM_MEMBER when user access is enabled (speaker role has recordingPlay permission)', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(200);
		});

		it('should get recording URL for ROOM_MANAGER when user access is enabled (speaker role has recordingPlay permission)', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/url`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
			expect(response.status).toBe(200);
		});

		it('should get recording URL for ROOM_MEMBER when user access is enabled (speaker role has recordingPlay permission)', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/url`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(200);
		});

		it('should download recordings ZIP for ROOM_MANAGER when user access is enabled (speaker role has recordingDownload permission)', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/download`)
				.query({ recordingIds: recordingId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
			expect(response.status).toBe(200);
		});

		it('should download recordings ZIP for ROOM_MEMBER when user access is enabled (speaker role has recordingDownload permission)', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/download`)
				.query({ recordingIds: recordingId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(200);
		});
	});

	describe('Access Secret Recording Resource Operations', () => {
		let roomData: RoomData;
		let roomId: string;
		let recordingId: string;
		let recordingSecret: string;

		beforeAll(async () => {
			// Ensure no recordings exist before starting tests
			await deleteAllRecordings();

			roomData = await setupSingleRoomWithRecording(true);
			roomId = roomData.room.roomId;
			recordingId = roomData.recordingId!;

			// End the meeting
			await disconnectFakeParticipants();
			await endMeeting(roomId, roomData.moderatorToken);

			recordingSecret = await getRecordingAccessSecret(recordingId, false);

			// Disable anonymous recording access for the room
			await updateRoomAccessConfig(roomId, {
				anonymous: {
					recording: {
						enabled: false
					}
				}
			});
		});

		it('should fail to get recording when using public access secret and anonymous recording access is disabled', async () => {
			const response = await request(app).get(`${RECORDINGS_PATH}/${recordingId}`).query({ recordingSecret });
			expectMeetError(response, errorAnonymousAccessDisabled(roomId, 'recording'));
		});

		it('should fail to get recording media when using public access secret and anonymous recording access is disabled', async () => {
			const response = await request(app)
				.get(`${RECORDINGS_PATH}/${recordingId}/media`)
				.query({ recordingSecret });
			expectMeetError(response, errorAnonymousAccessDisabled(roomId, 'recording'));
		});
	});
});
