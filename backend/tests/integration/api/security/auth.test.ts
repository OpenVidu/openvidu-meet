import { beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { UserRole } from '../../../../src/typings/ce/index.js';
import { loginUserAsRole, startTestServer } from '../../../helpers/request-helpers.js';

const AUTH_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`;

describe('Authentication API Tests', () => {
	let app: Express;

	beforeAll(() => {
		app = startTestServer();
	});

	describe('Login Tests', () => {
		it('should successfully login with valid credentials', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'user',
					password: 'user'
				})
				.expect(200);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toBe('Login succeeded');

			// Check for access token and refresh token cookies
			expect(response.headers['set-cookie']).toBeDefined();
			const cookies = response.headers['set-cookie'] as unknown as string[];
			const accessTokenCookie = cookies.find((cookie) => cookie.startsWith('OvMeetAccessToken='));
			const refreshTokenCookie = cookies.find((cookie) => cookie.startsWith('OvMeetRefreshToken='));
			expect(accessTokenCookie).toBeDefined();
			expect(refreshTokenCookie).toBeDefined();
		});

		it('should return 404 for invalid credentials', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'user',
					password: 'invalidpassword'
				})
				.expect(404);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid username or password');
		});

		it('should return 422 when username is missing', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					password: 'user'
				})
				.expect(422);

			expect(response.body).toHaveProperty('error', 'Unprocessable Entity');
			expect(response.body.details[0].field).toBe('username');
			expect(response.body.details[0].message).toContain('Required');
		});

		it('should return 422 when password is missing', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'user'
				})
				.expect(422);

			expect(response.body).toHaveProperty('error', 'Unprocessable Entity');
			expect(response.body.details[0].field).toBe('password');
			expect(response.body.details[0].message).toContain('Required');
		});

		it('should return 422 when username is too short', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'usr',
					password: 'user'
				})
				.expect(422);

			expect(response.body).toHaveProperty('error', 'Unprocessable Entity');
			expect(response.body.details[0].field).toBe('username');
			expect(response.body.details[0].message).toContain('Username must be at least 4 characters long');
		});

		it('should return 422 when password is too short', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'user',
					password: 'usr'
				})
				.expect(422);

			expect(response.body).toHaveProperty('error', 'Unprocessable Entity');
			expect(response.body.details[0].field).toBe('password');
			expect(response.body.details[0].message).toContain('Password must be at least 4 characters long');
		});
	});

	describe('Logout Tests', () => {
		it('should successfully logout', async () => {
			const response = await request(app).post(`${AUTH_PATH}/logout`).expect(200);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toBe('Logout successful');

			// Check for cleared cookies
			const cookies = response.headers['set-cookie'] as unknown as string[];
			const accessTokenCookie = cookies.find((cookie) => cookie.startsWith('OvMeetAccessToken=;'));
			const refreshTokenCookie = cookies.find((cookie) => cookie.startsWith('OvMeetRefreshToken=;'));
			expect(accessTokenCookie).toBeDefined();
			expect(refreshTokenCookie).toBeDefined();
		});
	});

	describe('Refresh Token Tests', () => {
		it('should successfully refresh token with valid refresh token', async () => {
			// First, login to get a valid refresh token
			const loginResponse = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'user',
					password: 'user'
				})
				.expect(200);

			const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
			const refreshTokenCookie = cookies.find((cookie) => cookie.startsWith('OvMeetRefreshToken=')) as string;

			const response = await request(app)
				.post(`${AUTH_PATH}/refresh`)
				.set('Cookie', [refreshTokenCookie])
				.expect(200);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toBe('Token refreshed');

			// Check for new access token cookie
			const newCookies = response.headers['set-cookie'] as unknown as string[];
			const newAccessTokenCookie = newCookies.find((cookie) => cookie.startsWith('OvMeetAccessToken='));
			expect(newAccessTokenCookie).toBeDefined();
		});

		it('should return 400 when no refresh token is provided', async () => {
			const response = await request(app).post(`${AUTH_PATH}/refresh`).expect(400);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('No refresh token provided');
		});

		it('should return 400 when refresh token is invalid', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/refresh`)
				.set('Cookie', 'OvMeetRefreshToken=invalidtoken')
				.expect(400);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid refresh token');
		});
	});

	describe('Profile Tests', () => {
		let userCookie: string;
		let adminCookie: string;

		beforeAll(async () => {
			// Get cookies for admin and user
			userCookie = await loginUserAsRole(UserRole.USER);
			adminCookie = await loginUserAsRole(UserRole.ADMIN);
		});

		it('should return 200 and user profile', async () => {
			const response = await request(app).get(`${AUTH_PATH}/profile`).set('Cookie', userCookie).expect(200);

			expect(response.body).toHaveProperty('username');
			expect(response.body.username).toBe('user');
			expect(response.body).toHaveProperty('role');
			expect(response.body.role).toContain('user');
		});

		it('should return 200 and admin profile', async () => {
			const response = await request(app).get(`${AUTH_PATH}/profile`).set('Cookie', adminCookie).expect(200);

			expect(response.body).toHaveProperty('username');
			expect(response.body.username).toBe('admin');
			expect(response.body).toHaveProperty('role');
			expect(response.body.role).toContain('admin');
		});

		it('should return 401 when no access token is provided', async () => {
			const response = await request(app).get(`${AUTH_PATH}/profile`).expect(401);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Unauthorized');
		});

		it('should return 401 when access token is invalid', async () => {
			const response = await request(app)
				.get(`${AUTH_PATH}/profile`)
				.set('Cookie', 'OvMeetAccessToken=invalidtoken')
				.expect(401);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});
	});
});
