import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetUserRole } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { createUser, deleteAllUsers, startTestServer } from '../../../helpers/request-helpers.js';
import { setupTestUsers } from '../../../helpers/test-scenarios.js';
import { TestUsers } from '../../../interfaces/scenarios.js';

const AUTH_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`;

describe('Authentication API Tests', () => {
	let app: Express;
	let testUsers: TestUsers;

	beforeAll(async () => {
		app = await startTestServer();
		testUsers = await setupTestUsers();
	});

	afterAll(async () => {
		await deleteAllUsers();
	});

	describe('Login Tests', () => {
		it('should succeed with valid root admin credentials', async () => {
			const response = await request(app).post(`${AUTH_PATH}/login`).send({
				userId: MEET_ENV.INITIAL_ADMIN_USER,
				password: MEET_ENV.INITIAL_ADMIN_PASSWORD
			});
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('logged in successfully');

			// Check for access and refresh tokens
			expect(response.body).toHaveProperty('accessToken');
			expect(response.body).toHaveProperty('refreshToken');
			expect(response.body.mustChangePassword).toBeUndefined();
		});

		it('should succeed with valid ADMIN user credentials', async () => {
			const response = await request(app).post(`${AUTH_PATH}/login`).send({
				userId: testUsers.admin.user.userId,
				password: testUsers.admin.password
			});
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('logged in successfully');

			// Check for access and refresh tokens
			expect(response.body).toHaveProperty('accessToken');
			expect(response.body).toHaveProperty('refreshToken');
			expect(response.body.mustChangePassword).toBeUndefined();
		});

		it('should succeed with valid USER user credentials', async () => {
			const response = await request(app).post(`${AUTH_PATH}/login`).send({
				userId: testUsers.user.user.userId,
				password: testUsers.user.password
			});
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('logged in successfully');

			// Check for access and refresh tokens
			expect(response.body).toHaveProperty('accessToken');
			expect(response.body).toHaveProperty('refreshToken');
			expect(response.body.mustChangePassword).toBeUndefined();
		});

		it('should succeed with valid ROOM_MEMBER user credentials', async () => {
			const response = await request(app).post(`${AUTH_PATH}/login`).send({
				userId: testUsers.roomMember.user.userId,
				password: testUsers.roomMember.password
			});
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('logged in successfully');

			// Check for access and refresh tokens
			expect(response.body).toHaveProperty('accessToken');
			expect(response.body).toHaveProperty('refreshToken');
			expect(response.body.mustChangePassword).toBeUndefined();
		});

		it('should succeed with user requiring password change but return temporary token', async () => {
			// Create a user (when created, this user is set to require password change)
			const userId = 'user_12345';
			const password = 'initialPass123';
			await createUser({
				userId,
				name: 'User',
				password,
				role: MeetUserRole.USER
			});

			// Attempt login
			const response = await request(app).post(`${AUTH_PATH}/login`).send({
				userId,
				password
			});
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('password change is required');

			// Check for access token but NOT refresh token
			expect(response.body).toHaveProperty('accessToken');
			expect(response.body).not.toHaveProperty('refreshToken');
			expect(response.body.mustChangePassword).toBe(true);
		});

		it('should fail with 404 when user ID does not exist', async () => {
			const response = await request(app).post(`${AUTH_PATH}/login`).send({
				userId: 'nonexistent_user',
				password: testUsers.user.password
			});
			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid user ID or password');
		});

		it('should fail with 404 when password is incorrect', async () => {
			const response = await request(app).post(`${AUTH_PATH}/login`).send({
				userId: testUsers.user.user.userId,
				password: 'wrongpassword'
			});
			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid user ID or password');
		});
	});

	describe('Login Validation Tests', () => {
		it('should fail when userId is missing', async () => {
			const response = await request(app).post(`${AUTH_PATH}/login`).send({
				password: 'adminpass'
			});
			expectValidationError(response, 'userId', 'Required');
		});

		it('should fail when password is missing', async () => {
			const response = await request(app).post(`${AUTH_PATH}/login`).send({
				userId: 'admin'
			});
			expectValidationError(response, 'password', 'Required');
		});

		it('should fail when userId is too short', async () => {
			const response = await request(app).post(`${AUTH_PATH}/login`).send({
				userId: 'admi',
				password: 'adminpass'
			});
			expectValidationError(response, 'userId', 'userId must be at least 5 characters long');
		});

		it('should fail when password is too short', async () => {
			const response = await request(app).post(`${AUTH_PATH}/login`).send({
				userId: 'admin',
				password: 'pass'
			});
			expectValidationError(response, 'password', 'password must be at least 5 characters long');
		});
	});
});
