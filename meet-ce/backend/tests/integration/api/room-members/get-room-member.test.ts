import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole, MeetRoomRoles, MeetUserRole } from '@openvidu-meet/typings';
import {
	createRoom,
	createRoomMember,
	createUser,
	deleteAllRooms,
	deleteAllUsers,
	getRoomMember,
	startTestServer
} from '../../../helpers/request-helpers.js';

describe('Room Members API Tests', () => {
	let roomId: string;
	let roomRoles: MeetRoomRoles;

	beforeAll(async () => {
		await startTestServer();

		const room = await createRoom();
		roomId = room.roomId;
		roomRoles = room.roles;
	});

	afterAll(async () => {
		await deleteAllRooms();
		await deleteAllUsers();
	});

	describe('Get Room Member Tests', () => {
		it('should successfully get a registered user room member', async () => {
			// Create a registered user as room member
			const userId = `user_${Date.now()}`;
			const userName = 'Registered Member';
			await createUser({
				userId,
				name: userName,
				password: 'password123',
				role: MeetUserRole.USER
			});
			const createResponse = await createRoomMember(roomId, {
				userId,
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			const memberId = createResponse.body.memberId;

			const response = await getRoomMember(roomId, memberId);
			expect(response.status).toBe(200);

			expect(response.body).toHaveProperty('memberId', memberId);
			expect(response.body.memberId).toBe(userId);
			expect(response.body).toHaveProperty('roomId', roomId);
			expect(response.body).toHaveProperty('name', userName);
			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.MODERATOR);
			expect(response.body).toHaveProperty('membershipDate');
			expect(response.body).toHaveProperty('accessUrl');
			expect(response.body).toHaveProperty('effectivePermissions');
			expect(response.body).toHaveProperty('permissionsUpdatedAt');
		});

		it('should successfully get an external user room member', async () => {
			// Create an external room member
			const memberName = 'External Member';
			const createResponse = await createRoomMember(roomId, {
				name: memberName,
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const memberId = createResponse.body.memberId;

			const response = await getRoomMember(roomId, memberId);
			expect(response.status).toBe(200);

			expect(response.body).toHaveProperty('memberId', memberId);
			expect(memberId).toMatch(/^ext-/);
			expect(response.body).toHaveProperty('roomId', roomId);
			expect(response.body).toHaveProperty('name', memberName);
			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.SPEAKER);
			expect(response.body).toHaveProperty('membershipDate');
			expect(response.body).toHaveProperty('accessUrl');
			expect(response.body).toHaveProperty('effectivePermissions');
			expect(response.body).toHaveProperty('permissionsUpdatedAt');
		});

		it('should successfully get a room member with MODERATOR role', async () => {
			// Create an external room member
			const createResponse = await createRoomMember(roomId, {
				name: 'External Member',
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			const memberId = createResponse.body.memberId;

			const response = await getRoomMember(roomId, memberId);
			expect(response.status).toBe(200);

			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.MODERATOR);
			expect(response.body.effectivePermissions).toEqual(roomRoles.moderator.permissions);
		});

		it('should successfully get a room member with SPEAKER role', async () => {
			// Create an external room member
			const createResponse = await createRoomMember(roomId, {
				name: 'External Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			const memberId = createResponse.body.memberId;

			const response = await getRoomMember(roomId, memberId);

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.SPEAKER);
			expect(response.body.effectivePermissions).toEqual(roomRoles.speaker.permissions);
		});

		it('should return member with custom permissions if set', async () => {
			// Create a member with custom permissions
			const memberResponse = await createRoomMember(roomId, {
				name: 'Custom Permissions Member',
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: {
					canRecord: true,
					canDeleteRecordings: true
				}
			});

			const response = await getRoomMember(roomId, memberResponse.body.memberId);
			expect(response.status).toBe(200);

			expect(response.body).toHaveProperty('customPermissions');
			expect(response.body.customPermissions).toHaveProperty('canRecord', true);
			expect(response.body.customPermissions).toHaveProperty('canDeleteRecordings', true);
			expect(response.body.effectivePermissions).toHaveProperty('canRecord', true);
			expect(response.body.effectivePermissions).toHaveProperty('canDeleteRecordings', true);
		});

		it('should fail when member does not exist', async () => {
			const response = await getRoomMember(roomId, 'nonexistent_member_123');
			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('not found');
		});

		it('should fail when room does not exist', async () => {
			const response = await getRoomMember('nonexistent_room_123', 'some_member_id');
			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('does not exist');
		});
	});
});
