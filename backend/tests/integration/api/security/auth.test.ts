import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Express } from 'express';
import { startTestServer, stopTestServer } from '../../../utils/server-setup.js';

const INTERNAL_BASE_URL = '/meet/internal-api/v1';
const AUTH_BASE_URL = `${INTERNAL_BASE_URL}/auth`;

describe('OpenVidu Meet Authentication API Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
	});

	afterAll(async () => {
		await stopTestServer();
	});

	describe('Login Tests', () => {
		it('should successfully login with valid credentials', async () => {
			const response = await request(app)
				.post(`${AUTH_BASE_URL}/login`)
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
				.post(`${AUTH_BASE_URL}/login`)
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
				.post(`${AUTH_BASE_URL}/login`)
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
				.post(`${AUTH_BASE_URL}/login`)
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
				.post(`${AUTH_BASE_URL}/login`)
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
				.post(`${AUTH_BASE_URL}/login`)
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
			const response = await request(app).post(`${AUTH_BASE_URL}/logout`).expect(200);

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
				.post(`${AUTH_BASE_URL}/login`)
				.send({
					username: 'user',
					password: 'user'
				})
				.expect(200);

			const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
			const refreshTokenCookie = cookies.find((cookie) => cookie.startsWith('OvMeetRefreshToken=')) as string;

			const response = await request(app)
				.post(`${AUTH_BASE_URL}/refresh`)
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
			const response = await request(app).post(`${AUTH_BASE_URL}/refresh`).expect(400);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('No refresh token provided');
		});

		it('should return 400 when refresh token is invalid', async () => {
			const response = await request(app)
				.post(`${AUTH_BASE_URL}/refresh`)
				.set('Cookie', 'OvMeetRefreshToken=invalidtoken')
				.expect(400);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid refresh token');
		});
	});

	describe('Profile Tests', () => {
		it('should return 200 and user profile', async () => {
			// First, login to get a valid access token
			const loginResponse = await request(app)
				.post(`${AUTH_BASE_URL}/login`)
				.send({
					username: 'user',
					password: 'user'
				})
				.expect(200);

			const cookies = loginResponse.headers['set-cookie'] as unknown as string[];

			const response = await request(app).get(`${AUTH_BASE_URL}/profile`).set('Cookie', cookies).expect(200);

			expect(response.body).toHaveProperty('username');
			expect(response.body.username).toBe('user');
			expect(response.body).toHaveProperty('role');
			expect(response.body.role).toContain('user');
		});

		it('should return 200 and admin profile', async () => {
			// First, login to get a valid access token
			const loginResponse = await request(app)
				.post(`${AUTH_BASE_URL}/login`)
				.send({
					username: 'admin',
					password: 'admin'
				})
				.expect(200);

			const cookies = loginResponse.headers['set-cookie'] as unknown as string[];

			const response = await request(app).get(`${AUTH_BASE_URL}/profile`).set('Cookie', cookies).expect(200);

			expect(response.body).toHaveProperty('username');
			expect(response.body.username).toBe('admin');
			expect(response.body).toHaveProperty('role');
			expect(response.body.role).toContain('admin');
		});

		it('should return 401 when no access token is provided', async () => {
			const response = await request(app).get(`${AUTH_BASE_URL}/profile`).expect(401);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Unauthorized');
		});

		it('should return 401 when access token is invalid', async () => {
			const response = await request(app)
				.get(`${AUTH_BASE_URL}/profile`)
				.set('Cookie', 'OvMeetAccessToken=invalidtoken')
				.expect(401);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});
	});
});
