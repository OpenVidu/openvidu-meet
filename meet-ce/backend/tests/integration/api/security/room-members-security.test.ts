import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole, MeetRoomMemberTokenMetadata } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import {
	errorInsufficientPermissions,
	errorInvalidRoomSecret,
	errorInvalidToken,
	errorRoomMemberNotFound,
	errorUnauthorized
} from '../../../../src/models/error.model.js';
import { TokenService } from '../../../../src/services/token.service.js';
import { expectMeetError } from '../../../helpers/assertion-helpers.js';
import {
	disconnectFakeParticipants,
	joinFakeParticipant,
	updateParticipantMetadata
} from '../../../helpers/livekit-cli-helpers.js';
import {
	createRoomMember,
	deleteAllRooms,
	deleteAllUsers,
	endMeeting,
	generateRoomMemberToken,
	getFullPath,
	getRoomMember,
	startTestServer,
	updateRoomAccessConfig
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom, setupTestUsers, setupTestUsersForRoom } from '../../../helpers/test-scenarios.js';
import { RoomData, RoomTestUsers, TestUsers } from '../../../interfaces/scenarios.js';

const ROOMS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`);
const INTERNAL_ROOMS_PATH = getFullPath(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms`);

describe('Room Members API Security Tests', () => {
	let app: Express;
	let testUsers: TestUsers;

	let roomData: RoomData;
	let roomId: string;
	let roomUsers: RoomTestUsers;

	let memberId: string;

	const createTestMember = async () => {
		const response = await createRoomMember(roomId, {
			name: 'Test Member',
			baseRole: MeetRoomMemberRole.SPEAKER
		});
		memberId = response.body.memberId;
	};

	beforeAll(async () => {
		app = await startTestServer();
		testUsers = await setupTestUsers();

		// Setup a single room and test users for that room
		roomData = await setupSingleRoom();
		roomData = await setupTestUsersForRoom(roomData);
		roomId = roomData.room.roomId;
		roomUsers = roomData.users!;

		// Create a test member in the room
		await createTestMember();
	});

	afterAll(async () => {
		await deleteAllRooms();
		await deleteAllUsers();
	});

	describe('Create Room Member Tests', () => {
		const newMemberData = {
			name: 'Test Member',
			baseRole: MeetRoomMemberRole.SPEAKER
		};

		it('should succeed when using API key', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send(newMemberData);
			expect(response.status).toBe(201);
		});

		it('should succeed when user is authenticated as ADMIN', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken)
				.send(newMemberData);
			expect(response.status).toBe(201);
		});

		it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken)
				.send(newMemberData);
			expect(response.status).toBe(201);
		});

		it('should fail when user is authenticated as ROOM_MANAGER and is room member', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken)
				.send(newMemberData);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken)
				.send(newMemberData);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is room member', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken)
				.send(newMemberData);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken)
				.send(newMemberData);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).post(`${ROOMS_PATH}/${roomId}/members`).send(newMemberData);
			expectMeetError(response, errorUnauthorized());
		});

		it('should fail when using room member token', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken)
				.send(newMemberData);
			expectMeetError(response, errorUnauthorized());
		});
	});

	describe('Get Room Members Tests', () => {
		it('should succeed when using API key', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as ADMIN', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MANAGER and is room member', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is room member', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomId}/members`);
			expectMeetError(response, errorUnauthorized());
		});

		it('should fail when using room member token', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expectMeetError(response, errorUnauthorized());
		});
	});

	describe('Get Room Member Tests', () => {
		it('should succeed when using API key', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as ADMIN', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as ROOM_MANAGER and is the same member', async () => {
			const roomMemberId = roomUsers.roomManagerMemberDetails.member.memberId;
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${roomMemberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MANAGER and is a different room member', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is the same member', async () => {
			const roomMemberId = roomUsers.roomMemberDetails.member.memberId;
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${roomMemberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is a different room member', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomId}/members/${memberId}`);
			expectMeetError(response, errorUnauthorized());
		});

		it('should succeed when using room member token of the same member', async () => {
			const roomMemberId = roomUsers.roomMemberDetails.member.memberId;
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${roomMemberId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomUsers.roomMemberDetails.memberToken);
			expect(response.status).toBe(200);
		});

		it('should fail when using room member token of a different member', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expectMeetError(response, errorInsufficientPermissions());
		});
	});

	describe('Update Room Member Tests', () => {
		const updateData = {
			baseRole: MeetRoomMemberRole.MODERATOR
		};

		it('should succeed when using API key', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send(updateData);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as ADMIN', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken)
				.send(updateData);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken)
				.send(updateData);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MANAGER and is room member', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken)
				.send(updateData);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken)
				.send(updateData);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is room member', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken)
				.send(updateData);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken)
				.send(updateData);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${ROOMS_PATH}/${roomId}/members/${memberId}`).send(updateData);
			expectMeetError(response, errorUnauthorized());
		});

		it('should fail when using room member token', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken)
				.send(updateData);
			expectMeetError(response, errorUnauthorized());
		});
	});

	describe('Delete Room Member Tests', () => {
		it('should succeed when using API key', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expect(response.status).toBe(200);

			// Recreate member for next tests since it was deleted
			await createTestMember();
		});

		it('should succeed when user is authenticated as ADMIN', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expect(response.status).toBe(200);

			// Recreate member for next tests since it was deleted
			await createTestMember();
		});

		it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken);
			expect(response.status).toBe(200);

			// Recreate member for next tests since it was deleted
			await createTestMember();
		});

		it('should fail when user is authenticated as ROOM_MANAGER and is room member', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is room member', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`);
			expectMeetError(response, errorUnauthorized());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});

		it('should fail when using room member token', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expectMeetError(response, errorUnauthorized());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});
	});

	describe('Bulk Delete Room Members Tests', () => {
		it('should succeed when using API key', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expect(response.status).toBe(200);

			// Recreate member for next tests since it was deleted
			await createTestMember();
		});

		it('should succeed when user is authenticated as ADMIN', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expect(response.status).toBe(200);

			// Recreate member for next tests since it was deleted
			await createTestMember();
		});

		it('should succeed when user is authenticated as ROOM_MANAGER and is room owner', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken);
			expect(response.status).toBe(200);

			// Recreate member for next tests since it was deleted
			await createTestMember();
		});

		it('should fail when user is authenticated as ROOM_MANAGER and is room member', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MANAGER without access to the room', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is room member', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId });
			expectMeetError(response, errorUnauthorized());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});

		it('should fail when using room member token', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expectMeetError(response, errorUnauthorized());
			expect((await getRoomMember(roomId, memberId)).status).toBe(200);
		});
	});

	describe('Generate Room Member Token Tests', () => {
		it('should succeed when using room moderator secret', async () => {
			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`).send({
				secret: roomData.moderatorSecret,
				joinMeeting: false
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when using room speaker secret', async () => {
			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`).send({
				secret: roomData.speakerSecret,
				joinMeeting: false
			});
			expect(response.status).toBe(200);
		});

		it('should succeed when using room recording secret', async () => {
			expect(roomData.recordingSecret).toBeDefined();

			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`).send({
				secret: roomData.recordingSecret,
				joinMeeting: false
			});
			expect(response.status).toBe(200);
		});

		it('should fail when using invalid room secret', async () => {
			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`).send({
				secret: 'invalid_secret',
				joinMeeting: false
			});
			expectMeetError(response, errorInvalidRoomSecret(roomId));
		});

		it('should succeed when using valid identified guest ID as secret', async () => {
			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`).send({
				secret: memberId,
				joinMeeting: false
			});
			expect(response.status).toBe(200);
		});

		it('should fail when using non-existent member ID as secret', async () => {
			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`).send({
				secret: 'guest-nonexistent',
				joinMeeting: false
			});
			expectMeetError(response, errorRoomMemberNotFound(roomId, 'guest-nonexistent'));
		});

		it('should fail when using API key without secret', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({
					joinMeeting: false
				});
			expectMeetError(response, errorUnauthorized());
		});

		it('should succeed when user is authenticated as ADMIN without secret', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken)
				.send({
					joinMeeting: false
				});
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as ROOM_MANAGER and is room owner without secret', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerOwner.accessToken)
				.send({
					joinMeeting: false
				});
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as ROOM_MANAGER and is room member without secret', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomManagerMember.accessToken)
				.send({
					joinMeeting: false
				});
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MANAGER without access to the room and no secret', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken)
				.send({
					joinMeeting: false
				});
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should succeed when user is authenticated as ROOM_MANAGER without membership and user access is enabled', async () => {
			// Enable user access for the room
			await updateRoomAccessConfig(roomId, {
				user: {
					enabled: true
				}
			});

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken)
				.send({
					joinMeeting: false
				});
			expect(response.status).toBe(200);

			// Disable user access after test
			await updateRoomAccessConfig(roomId, {
				user: {
					enabled: false
				}
			});
			// Regenerate moderator token since room config was updated
			roomData.moderatorToken = await generateRoomMemberToken(roomId, {
				secret: roomData.moderatorSecret
			});
		});

		it('should succeed when user is authenticated as ROOM_MEMBER and is room member without secret', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken)
				.send({
					joinMeeting: false
				});
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room and no secret', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken)
				.send({
					joinMeeting: false
				});
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should succeed when user is authenticated as ROOM_MEMBER without membership and user access is disabled', async () => {
			// Enable user access for the room
			await updateRoomAccessConfig(roomId, {
				user: {
					enabled: true
				}
			});

			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken)
				.send({
					joinMeeting: false
				});
			expect(response.status).toBe(200);

			// Disable user access after test
			await updateRoomAccessConfig(roomId, {
				user: {
					enabled: false
				}
			});
			// Regenerate moderator token since room config was updated
			roomData.moderatorToken = await generateRoomMemberToken(roomId, {
				secret: roomData.moderatorSecret
			});
		});

		it('should fail when user is not authenticated and no secret provided', async () => {
			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`).send({
				joinMeeting: false
			});
			expectMeetError(response, errorUnauthorized());
		});
	});

	describe('Refresh Room Member Token Tests', () => {
		it('should succeed when using valid room member token for joining meeting', async () => {
			// Generate a room member token for joining the meeting
			const previousToken = await generateRoomMemberToken(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName: 'Test Participant'
			});

			// Extract participant identity and metadata from the token
			const tokenService = container.get(TokenService);
			const claims = tokenService.getClaimsIgnoringExpiration(previousToken);
			const participantIdentity = claims.sub;
			expect(participantIdentity).toBeDefined();
			const metadata = JSON.parse(claims.metadata || '{}') as MeetRoomMemberTokenMetadata;

			// Simulate participant joining the meeting
			await joinFakeParticipant(roomId, participantIdentity!);
			await updateParticipantMetadata(roomId, participantIdentity!, metadata);

			// Attempt to refresh the token using the valid previous room member token
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token/refresh`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, previousToken);
			expect(response.status).toBe(200);

			// Clean up by disconnecting the fake participant and ending the meeting
			await disconnectFakeParticipants();
			await endMeeting(roomId, previousToken);
		});

		it('should fail when using valid room member token not for joining meeting', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token/refresh`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomUsers.roomMemberDetails.memberToken);
			expectMeetError(response, errorInvalidToken());
		});

		it('should fail when using valid room member token for a different room', async () => {
			// Generate a room member token for a different room
			const differentRoom = await setupSingleRoom();
			const previousToken = await generateRoomMemberToken(differentRoom.room.roomId, {
				secret: differentRoom.moderatorSecret,
				joinMeeting: true,
				participantName: 'Test Participant'
			});

			// Attempt to refresh the token using the valid room member token for a different room
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token/refresh`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, previousToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should read a token header without the Bearer prefix as no credentials at all', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token/refresh`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, 'invalid_token');
			expectMeetError(response, errorUnauthorized());
		});

		it('should fail when user is not authenticated with room member token', async () => {
			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token/refresh`);
			expectMeetError(response, errorUnauthorized());
		});
	});
});
