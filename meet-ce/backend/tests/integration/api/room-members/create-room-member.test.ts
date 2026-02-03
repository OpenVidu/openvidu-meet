import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberOptions, MeetRoomMemberRole, MeetUserRole } from '@openvidu-meet/typings';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	createRoom,
	createRoomMember,
	createUser,
	deleteAllRooms,
	deleteAllUsers,
	getRoomMember,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { setupTestUsers } from '../../../helpers/test-scenarios.js';
import { TestUsers } from '../../../interfaces/scenarios.js';

describe('Room Members API Tests', () => {
	let roomId: string;
	let testUsers: TestUsers;

	beforeAll(async () => {
		await startTestServer();
		testUsers = await setupTestUsers();

		const room = await createRoom();
		roomId = room.roomId;
	});

	afterAll(async () => {
		await deleteAllRooms();
		await deleteAllUsers();
	});

	describe('Create Room Member Tests', () => {
		let userId: string;

		beforeEach(async () => {
			userId = `user_${Date.now()}`;
			await createUser({
				userId,
				name: 'Test User',
				password: 'password123',
				role: MeetUserRole.USER
			});
		});

		it('should successfully create room member with userId (registered user)', async () => {
			const response = await createRoomMember(roomId, {
				userId,
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			expect(response.status).toBe(201);
			expect(response.body).toHaveProperty('memberId', userId);
			expect(response.body).toHaveProperty('roomId', roomId);
			expect(response.body).toHaveProperty('name', 'Test User');
			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.SPEAKER);
			expect(response.body).toHaveProperty('membershipDate');
			expect(response.body).toHaveProperty('accessUrl', `/room/${roomId}`);
			expect(response.body).toHaveProperty('effectivePermissions');
			expect(response.body).toHaveProperty('permissionsUpdatedAt');

			// Verify Location header is set correctly
			expect(response.headers).toHaveProperty('location');
			expect(response.headers.location).toContain(`/rooms/${roomId}/members/${userId}`);
		});

		it('should successfully create room member with name (external user)', async () => {
			const externalUserName = 'External User';
			const response = await createRoomMember(roomId, {
				name: externalUserName,
				baseRole: MeetRoomMemberRole.MODERATOR
			});

			expect(response.status).toBe(201);
			expect(response.body).toHaveProperty('memberId');
			expect(response.body.memberId).toMatch(/^ext-/); // External users have memberId starting with 'ext-'
			expect(response.body).toHaveProperty('roomId', roomId);
			expect(response.body).toHaveProperty('name', externalUserName);
			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.MODERATOR);
			expect(response.body).toHaveProperty('membershipDate');
			expect(response.body).toHaveProperty('accessUrl', `/room/${roomId}?secret=${response.body.memberId}`);
			expect(response.body).toHaveProperty('effectivePermissions');
			expect(response.body).toHaveProperty('permissionsUpdatedAt');
		});

		it('should successfully create room member with MODERATOR role', async () => {
			const response = await createRoomMember(roomId, {
				userId,
				baseRole: MeetRoomMemberRole.MODERATOR
			});

			expect(response.status).toBe(201);
			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.MODERATOR);
			expect(response.body.effectivePermissions).toHaveProperty('canKickParticipants', true);
			expect(response.body.effectivePermissions).toHaveProperty('canEndMeeting', true);
			expect(response.body.effectivePermissions).toHaveProperty('canMakeModerator', true);
		});

		it('should successfully create room member with SPEAKER role', async () => {
			const response = await createRoomMember(roomId, {
				userId,
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			expect(response.status).toBe(201);
			expect(response.body).toHaveProperty('baseRole', MeetRoomMemberRole.SPEAKER);
			expect(response.body.effectivePermissions).toHaveProperty('canPublishAudio', true);
			expect(response.body.effectivePermissions).toHaveProperty('canPublishVideo', true);
		});

		it('should successfully create room member with custom permissions', async () => {
			const response = await createRoomMember(roomId, {
				userId,
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: {
					canRecord: true,
					canDeleteRecordings: true
				}
			});

			expect(response.status).toBe(201);
			expect(response.body).toHaveProperty('customPermissions');
			expect(response.body.customPermissions).toHaveProperty('canRecord', true);
			expect(response.body.customPermissions).toHaveProperty('canDeleteRecordings', true);
			expect(response.body.effectivePermissions).toHaveProperty('canRecord', true);
			expect(response.body.effectivePermissions).toHaveProperty('canDeleteRecordings', true);
		});

		it('should verify room member is actually created', async () => {
			// Create room member
			const createResponse = await createRoomMember(roomId, {
				userId,
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			expect(createResponse.status).toBe(201);

			// Verify member exists
			const getMemberResponse = await getRoomMember(roomId, userId);
			expect(getMemberResponse.status).toBe(200);
			expect(getMemberResponse.body).toHaveProperty('memberId', userId);
		});

		it('should fail when creating duplicate room member', async () => {
			// Create member first time
			const firstResponse = await createRoomMember(roomId, {
				userId,
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			expect(firstResponse.status).toBe(201);

			// Try to create same member again
			const secondResponse = await createRoomMember(roomId, {
				userId,
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			expect(secondResponse.status).toBe(409);
			expect(secondResponse.body).toHaveProperty('message');
			expect(secondResponse.body.message).toContain('already a member');
		});

		it('should fail when userId does not exist', async () => {
			const response = await createRoomMember(roomId, {
				userId: 'nonexistent_user_123',
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('not found');
		});

		it('should fail when room does not exist', async () => {
			const response = await createRoomMember('nonexistent_room_123', {
				userId,
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('does not exist');
		});

		it('should fail when trying to add room owner as member', async () => {
			const room = await createRoom(undefined, testUsers.user.accessToken);

			const response = await createRoomMember(room.roomId, {
				userId: testUsers.user.user.userId,
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			expect(response.status).toBe(409);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('cannot be added as a member');
		});

		it('should fail when trying to add admin user as member', async () => {
			const response = await createRoomMember(roomId, {
				userId: testUsers.admin.user.userId,
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			expect(response.status).toBe(409);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('cannot be added as a member');
		});
	});

	describe('Create Room Member Validation Tests', () => {
		it('should fail when baseRole is missing', async () => {
			const response = await createRoomMember(roomId, {
				name: 'Test User'
			} as MeetRoomMemberOptions);
			expectValidationError(response, 'baseRole', 'Required');
		});

		it('should fail when baseRole is invalid', async () => {
			const response = await createRoomMember(roomId, {
				name: 'Test User',
				baseRole: 'invalid' as MeetRoomMemberRole
			});
			expectValidationError(response, 'baseRole', 'Invalid enum value');
		});

		it('should fail when neither userId nor name is provided', async () => {
			const response = await createRoomMember(roomId, {
				baseRole: MeetRoomMemberRole.SPEAKER
			} as MeetRoomMemberOptions);
			expectValidationError(response, 'userId', 'Either userId or name must be provided');
		});

		it('should fail when both userId and name are provided', async () => {
			const response = await createRoomMember(roomId, {
				userId: testUsers.user.user.userId,
				name: 'External User',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			expectValidationError(response, 'userId', 'Either userId or name must be provided, but not both');
		});

		it('should fail when name is empty', async () => {
			const response = await createRoomMember(roomId, {
				name: '',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			expectValidationError(response, 'name', 'cannot be empty');
		});

		it('should fail when name exceeds max length', async () => {
			const response = await createRoomMember(roomId, {
				name: 'a'.repeat(51), // Max is 50
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			expectValidationError(response, 'name', 'cannot exceed 50 characters');
		});

		it('should fail when userId contains invalid characters', async () => {
			const response = await createRoomMember(roomId, {
				userId: 'invalid-user-id!',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			expectValidationError(response, 'userId', 'must contain only lowercase letters, numbers, and underscores');
		});
	});
});
