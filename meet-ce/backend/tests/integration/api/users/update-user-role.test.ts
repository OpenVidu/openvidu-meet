import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetUserRole } from '@openvidu-meet/typings';
import { MEET_ENV } from '../../../../src/environment.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	createUser,
	deleteAllUsers,
	getUser,
	startTestServer,
	updateUserRole
} from '../../../helpers/request-helpers.js';
import { setupTestUsers } from '../../../helpers/test-scenarios.js';
import { TestUsers } from '../../../interfaces/scenarios.js';

describe('Users API Tests', () => {
	let testUsers: TestUsers;

	beforeAll(async () => {
		await startTestServer();
		testUsers = await setupTestUsers();
	});

	afterAll(async () => {
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

			// Verify role persisted by getting user
			const getUserResponse = await getUser(userId);
			expect(getUserResponse.status).toBe(200);
			expect(getUserResponse.body).toHaveProperty('role', MeetUserRole.ADMIN);
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
