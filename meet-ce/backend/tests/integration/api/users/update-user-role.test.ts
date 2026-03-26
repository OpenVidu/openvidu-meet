import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole, MeetUserRole } from '@openvidu-meet/typings';
import { MEET_ENV } from '../../../../src/environment.js';
import { MeetRecordingModel } from '../../../../src/models/mongoose-schemas/recording.schema.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import {
	createRoom,
	createRoomMember,
	createUser,
	deleteAllRecordings,
	deleteAllRooms,
	deleteAllUsers,
	getRoom,
	getRoomMember,
	getUser,
	startTestServer,
	updateUserRole
} from '../../../helpers/request-helpers.js';
import { createRecordingForRoom, setupTestUsers, setupUser } from '../../../helpers/test-scenarios.js';
import { TestUsers } from '../../../interfaces/scenarios.js';

describe('Users API Tests', () => {
	let testUsers: TestUsers;

	beforeAll(async () => {
		await startTestServer();
		testUsers = await setupTestUsers();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
		await deleteAllUsers();
	});

	describe('Update User Role Tests', () => {
		it('should successfully update user role to ADMIN', async () => {
			const response = await updateUserRole(testUsers.user.user.userId, MeetUserRole.ADMIN);
			expect(response.status).toBe(200);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('updated successfully');
			expect(response.body.message).toContain(MeetUserRole.ADMIN);

			expect(response.body).toHaveProperty('user');
			expect(response.body.user).toHaveProperty('userId', testUsers.user.user.userId);
			expect(response.body.user).toHaveProperty('role', MeetUserRole.ADMIN);
			expect(response.body.user).toHaveProperty('roleUpdatedAt');
		});

		it('should successfully update user role to USER', async () => {
			// Create user with ADMIN role first
			const userId = `user_${Date.now()}`;
			await createUser({
				userId,
				name: 'Test User',
				password: 'password123',
				role: MeetUserRole.ADMIN
			});

			// Update role to USER
			const response = await updateUserRole(userId, MeetUserRole.USER);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('user');
			expect(response.body.user).toHaveProperty('role', MeetUserRole.USER);
		});

		it('should successfully update user role to ROOM_MEMBER', async () => {
			// Create user with USER role first
			const userId = `user_${Date.now()}`;
			await createUser({
				userId,
				name: 'Test User',
				password: 'password123',
				role: MeetUserRole.USER
			});

			// Update role to ROOM_MEMBER
			const response = await updateUserRole(userId, MeetUserRole.ROOM_MEMBER);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('user');
			expect(response.body.user).toHaveProperty('role', MeetUserRole.ROOM_MEMBER);
		});

		it('should persist role change after update', async () => {
			// Create user with USER role first
			const userId = `user_${Date.now()}`;
			await createUser({
				userId,
				name: 'Test User',
				password: 'password123',
				role: MeetUserRole.USER
			});

			// Update role to ADMIN
			const updateResponse = await updateUserRole(userId, MeetUserRole.ADMIN);
			expect(updateResponse.status).toBe(200);
			expect(updateResponse.body.user).toHaveProperty('roleUpdatedAt');

			// Verify role persisted by getting user
			const getUserResponse = await getUser(userId);
			expect(getUserResponse.status).toBe(200);
			expect(getUserResponse.body).toHaveProperty('role', MeetUserRole.ADMIN);
			expect(getUserResponse.body).toHaveProperty('roleUpdatedAt');
			expect(getUserResponse.body.roleUpdatedAt).toBe(updateResponse.body.user.roleUpdatedAt);
			expect(getUserResponse.body.roleUpdatedAt).toBeGreaterThanOrEqual(getUserResponse.body.registrationDate);
		});

		it('should not expose sensitive fields in response', async () => {
			const response = await updateUserRole(testUsers.user.user.userId, MeetUserRole.ADMIN);
			expect(response.status).toBe(200);
			expect(response.body.user).not.toHaveProperty('passwordHash');
			expect(response.body.user).not.toHaveProperty('mustChangePassword');
			expect(response.body.user).toHaveProperty('userId');
			expect(response.body.user).toHaveProperty('name');
			expect(response.body.user).toHaveProperty('role');
			expect(response.body.user).toHaveProperty('registrationDate');
			expect(response.body.user).toHaveProperty('roleUpdatedAt');
		});

		it('should fail when trying to update own role', async () => {
			const response = await updateUserRole(
				testUsers.admin.user.userId,
				MeetUserRole.USER,
				testUsers.admin.accessToken
			);
			expect(response.status).toBe(403);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Cannot change your own role');
		});

		it('should fail when root admin tries to update own role', async () => {
			const response = await updateUserRole(MEET_ENV.INITIAL_ADMIN_USER, MeetUserRole.USER);
			expect(response.status).toBe(403);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Cannot change the role of the root admin user');
		});

		it('should fail when trying to update root admin role', async () => {
			const response = await updateUserRole(
				MEET_ENV.INITIAL_ADMIN_USER,
				MeetUserRole.USER,
				testUsers.admin.accessToken
			);
			expect(response.status).toBe(403);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Cannot change the role of the root admin user');
		});

		it('should fail when user does not exist', async () => {
			const response = await updateUserRole('nonexistent_user_123', MeetUserRole.ADMIN);
			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('not found');
		});

		it('should transfer owned rooms to root admin when USER is changed to ROOM_MEMBER', async () => {
			// Create user with USER role first
			const userId = `user_${Date.now()}`;
			const userData = await setupUser({
				userId,
				name: 'Test User',
				password: 'password123',
				role: MeetUserRole.USER
			});

			// Create a room owned by this user
			const room = await createRoom(undefined, userData.accessToken);

			// Update role to ROOM_MEMBER
			const result = await updateUserRole(userId, MeetUserRole.ROOM_MEMBER);
			expect(result.status).toBe(200);
			expect(result.body.user.role).toBe(MeetUserRole.ROOM_MEMBER);

			// Verify the room ownership has been transferred to root admin
			const updatedRoomResponse = await getRoom(room.roomId);
			expect(updatedRoomResponse.status).toBe(200);
			expect(updatedRoomResponse.body.owner).toBe(MEET_ENV.INITIAL_ADMIN_USER);
		});

		it('should update recording roomOwner when ownership is transferred by role change', async () => {
			// Create user with USER role first
			const userId = `user_${Date.now()}`;
			const userData = await setupUser({
				userId,
				name: 'Owner With Recording',
				password: 'password123',
				role: MeetUserRole.USER
			});

			// Create a room owned by this user and a recording for that room
			const room = await createRoom(undefined, userData.accessToken);
			const recordingId = await createRecordingForRoom(room.roomId);

			// Verify initial recording roomOwner
			let recording = await MeetRecordingModel.findOne({ recordingId }, 'roomOwner').lean().exec();
			expect(recording).toBeTruthy();
			expect(recording?.roomOwner).toBe(userData.user.userId);

			// Update role to ROOM_MEMBER
			const result = await updateUserRole(userId, MeetUserRole.ROOM_MEMBER);
			expect(result.status).toBe(200);

			// Verify the recording's roomOwner has been transferred to root admin
			recording = await MeetRecordingModel.findOne({ recordingId }, 'roomOwner').lean().exec();
			expect(recording).toBeTruthy();
			expect(recording?.roomOwner).toBe(MEET_ENV.INITIAL_ADMIN_USER);
		});

		it('should remove memberships when USER is changed to ADMIN', async () => {
			// Create user with USER role first
			const userId = `user_${Date.now()}`;
			await createUser({
				userId,
				name: 'Test User',
				password: 'password123',
				role: MeetUserRole.USER
			});

			// Create a room and add the user as a member
			const room = await createRoom();
			await createRoomMember(room.roomId, {
				userId,
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			// Verify membership exists
			const getMemberResponse = await getRoomMember(room.roomId, userId);
			expect(getMemberResponse.status).toBe(200);
			expect(getMemberResponse.body).toHaveProperty('memberId', userId);

			// Update role to ADMIN
			const result = await updateUserRole(userId, MeetUserRole.ADMIN);
			expect(result.status).toBe(200);
			expect(result.body.user.role).toBe(MeetUserRole.ADMIN);

			// Verify the user is no longer a member of the room
			const getMemberAfterResponse = await getRoomMember(room.roomId, userId);
			expect(getMemberAfterResponse.status).toBe(404);
		});
	});

	describe('Update User Role Validation Tests', () => {
		it('should fail when role is missing', async () => {
			const response = await updateUserRole(testUsers.user.user.userId, undefined as unknown as MeetUserRole);
			expectValidationError(response, 'role', 'Required');
		});

		it('should fail when role is invalid', async () => {
			const response = await updateUserRole(testUsers.user.user.userId, 'INVALID_ROLE' as MeetUserRole);
			expectValidationError(response, 'role', 'Invalid enum value');
		});
	});
});
