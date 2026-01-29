import { beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { createRoomMember, deleteAllRooms, deleteAllUsers, startTestServer } from '../../../helpers/request-helpers.js';
import { setupSingleRoom, setupTestUsers, setupTestUsersForRoom } from '../../../helpers/test-scenarios.js';
import { RoomData, RoomTestUsers, TestUsers } from '../../../interfaces/scenarios.js';

const ROOMS_PATH = `${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`;
const INTERNAL_ROOMS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/rooms`;

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

		it('should succeed when user is authenticated as USER and is room owner', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken)
				.send(newMemberData);
			expect(response.status).toBe(201);
		});

		it('should fail when user is authenticated as USER and is room member', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken)
				.send(newMemberData);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as USER without access to the room', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken)
				.send(newMemberData);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is room member', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken)
				.send(newMemberData);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken)
				.send(newMemberData);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).post(`${ROOMS_PATH}/${roomId}/members`).send(newMemberData);
			expect(response.status).toBe(401);
		});

		it('should fail when using room member token', async () => {
			const response = await request(app)
				.post(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken)
				.send(newMemberData);
			expect(response.status).toBe(401);
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

		it('should succeed when user is authenticated as USER and is room owner', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as USER and is room member', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as USER without access to the room', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is room member', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomId}/members`);
			expect(response.status).toBe(401);
		});

		it('should fail when using room member token', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(response.status).toBe(401);
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

		it('should succeed when user is authenticated as USER and is room owner', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as USER and is the same member', async () => {
			const roomMemberId = roomUsers.userMemberDetails.member.memberId;
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${roomMemberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as USER and is a different room member', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as USER without access to the room', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is the same member', async () => {
			const roomMemberId = roomUsers.roomMemberDetails.member.memberId;
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${roomMemberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is a different room member', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomId}/members/${memberId}`);
			expect(response.status).toBe(401);
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
			expect(response.status).toBe(403);
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

		it('should succeed when user is authenticated as USER and is room owner', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken)
				.send(updateData);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as USER and is room member', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken)
				.send(updateData);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as USER without access to the room', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken)
				.send(updateData);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is room member', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken)
				.send(updateData);
			expect(response.status).toBe(403);
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken)
				.send(updateData);
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${ROOMS_PATH}/${roomId}/members/${memberId}`).send(updateData);
			expect(response.status).toBe(401);
		});

		it('should fail when using room member token', async () => {
			const response = await request(app)
				.put(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken)
				.send(updateData);
			expect(response.status).toBe(401);
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

		it('should succeed when user is authenticated as USER and is room owner', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken);
			expect(response.status).toBe(200);

			// Recreate member for next tests since it was deleted
			await createTestMember();
		});

		it('should fail when user is authenticated as USER and is room member', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
			expect(response.status).toBe(403);
			// No need to recreate - member was not deleted
		});

		it('should fail when user is authenticated as USER without access to the room', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
			expect(response.status).toBe(403);
			// No need to recreate - member was not deleted
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is room member', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
			// No need to recreate - member was not deleted
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
			// No need to recreate - member was not deleted
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`);
			expect(response.status).toBe(401);
			// No need to recreate - member was not deleted
		});

		it('should fail when using room member token', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members/${memberId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(response.status).toBe(401);
			// No need to recreate - member was not deleted
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

		it('should succeed when user is authenticated as USER and is room owner', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken);
			expect(response.status).toBe(200);

			// Recreate member for next tests since it was deleted
			await createTestMember();
		});

		it('should fail when user is authenticated as USER and is room member', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken);
			expect(response.status).toBe(403);
			// No need to recreate - member was not deleted
		});

		it('should fail when user is authenticated as USER without access to the room', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
			expect(response.status).toBe(403);
			// No need to recreate - member was not deleted
		});

		it('should fail when user is authenticated as ROOM_MEMBER and is room member', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
			// No need to recreate - member was not deleted
		});

		it('should fail when user is authenticated as ROOM_MEMBER without access to the room', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
			// No need to recreate - member was not deleted
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId });
			expect(response.status).toBe(401);
			// No need to recreate - member was not deleted
		});

		it('should fail when using room member token', async () => {
			const response = await request(app)
				.delete(`${ROOMS_PATH}/${roomId}/members`)
				.query({ memberIds: memberId })
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(response.status).toBe(401);
			// No need to recreate - member was not deleted
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

		it('should fail when using invalid room secret', async () => {
			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`).send({
				secret: 'invalid_secret',
				joinMeeting: false
			});
			expect(response.status).toBe(400);
		});

		it('should succeed when using valid external member ID as secret', async () => {
			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`).send({
				secret: memberId,
				joinMeeting: false
			});
			expect(response.status).toBe(200);
		});

		it('should fail when using non-existent member ID as secret', async () => {
			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`).send({
				secret: 'ext-nonexistent',
				joinMeeting: false
			});
			expect(response.status).toBe(404);
		});

		it('should fail when using API key without secret', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({
					joinMeeting: false
				});
			expect(response.status).toBe(401);
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

		it('should succeed when user is authenticated as USER and is room owner without secret', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userOwner.accessToken)
				.send({
					joinMeeting: false
				});
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as USER and is room member without secret', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomUsers.userMember.accessToken)
				.send({
					joinMeeting: false
				});
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as USER without access to the room and no secret', async () => {
			const response = await request(app)
				.post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken)
				.send({
					joinMeeting: false
				});
			expect(response.status).toBe(403);
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
			expect(response.status).toBe(403);
		});

		it('should fail when user is not authenticated and no secret provided', async () => {
			const response = await request(app).post(`${INTERNAL_ROOMS_PATH}/${roomId}/members/token`).send({
				joinMeeting: false
			});
			expect(response.status).toBe(401);
		});
	});
});
