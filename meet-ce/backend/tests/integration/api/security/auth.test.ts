import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { AuthTransportMode } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { ApiKeyService } from '../../../../src/services/index.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	changeAuthTransportMode,
	extractCookieFromHeaders,
	generateApiKey,
	getApiKeys,
	loginUser,
	startTestServer
} from '../../../helpers/request-helpers.js';

const AUTH_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`;

describe('Authentication API Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
	});

	describe('Login Tests', () => {
		it('should successfully login with valid credentials', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'admin',
					password: 'admin'
				})
				.expect(200);

			expect(response.body).toHaveProperty('message');

			// Check for access and refresh tokens
			expect(response.body).toHaveProperty('accessToken');
			expect(response.body).toHaveProperty('refreshToken');
		});

		it('should successfully login and set cookies in cookie mode', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'admin',
					password: 'admin'
				})
				.expect(200);

			// Check for access and refresh token cookies
			const accessTokenCookie = extractCookieFromHeaders(response, INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME);
			const refreshTokenCookie = extractCookieFromHeaders(response, INTERNAL_CONFIG.REFRESH_TOKEN_COOKIE_NAME);
			expect(accessTokenCookie).toBeDefined();
			expect(refreshTokenCookie).toBeDefined();

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should return 404 for invalid credentials', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'admin',
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

			expectValidationError(response, 'username', 'Required');
		});

		it('should return 422 when password is missing', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'user'
				})
				.expect(422);

			expectValidationError(response, 'password', 'Required');
		});

		it('should return 422 when username is too short', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'usr',
					password: 'user'
				})
				.expect(422);

			expectValidationError(response, 'username', 'Username must be at least 4 characters long');
		});

		it('should return 422 when password is too short', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'user',
					password: 'usr'
				})
				.expect(422);

			expectValidationError(response, 'password', 'Password must be at least 4 characters long');
		});
	});

	describe('Logout Tests', () => {
		it('should successfully logout', async () => {
			const response = await request(app).post(`${AUTH_PATH}/logout`).expect(200);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toBe('Logout successful');
		});

		it('should successfully logout and clear cookies in cookie mode', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			const response = await request(app).post(`${AUTH_PATH}/logout`).expect(200);

			// Check that the access and refresh token cookies are cleared
			const accessTokenCookie = extractCookieFromHeaders(response, INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME);
			const refreshTokenCookie = extractCookieFromHeaders(response, INTERNAL_CONFIG.REFRESH_TOKEN_COOKIE_NAME);
			expect(accessTokenCookie).toBeDefined();
			expect(accessTokenCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
			expect(refreshTokenCookie).toBeDefined();
			expect(refreshTokenCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});
	});

	describe('Refresh Token Tests', () => {
		it('should successfully refresh token with valid refresh token', async () => {
			// First, login to get a valid refresh token
			const loginResponse = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'admin',
					password: 'admin'
				})
				.expect(200);

			expect(loginResponse.body).toHaveProperty('refreshToken');
			const refreshToken = loginResponse.body.refreshToken;

			const response = await request(app)
				.post(`${AUTH_PATH}/refresh`)
				.set(INTERNAL_CONFIG.REFRESH_TOKEN_HEADER, `Bearer ${refreshToken}`)
				.expect(200);

			expect(response.body).toHaveProperty('message');
			expect(response.body).toHaveProperty('accessToken');
		});

		it('should successfully refresh token and set new access token cookie in cookie mode', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// First, login to get a valid refresh token cookie
			const loginResponse = await request(app)
				.post(`${AUTH_PATH}/login`)
				.send({
					username: 'admin',
					password: 'admin'
				})
				.expect(200);

			const refreshTokenCookie = extractCookieFromHeaders(
				loginResponse,
				INTERNAL_CONFIG.REFRESH_TOKEN_COOKIE_NAME
			);
			expect(refreshTokenCookie).toBeDefined();

			const response = await request(app)
				.post(`${AUTH_PATH}/refresh`)
				.set('Cookie', refreshTokenCookie!)
				.expect(200);

			// Check that a new access token cookie is set
			const newAccessTokenCookie = extractCookieFromHeaders(response, INTERNAL_CONFIG.ACCESS_TOKEN_COOKIE_NAME);
			expect(newAccessTokenCookie).toBeDefined();

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should return 400 when no refresh token is provided', async () => {
			const response = await request(app).post(`${AUTH_PATH}/refresh`).expect(400);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('No refresh token provided');
		});

		it('should return 400 when refresh token is invalid', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/refresh`)
				.set(INTERNAL_CONFIG.REFRESH_TOKEN_HEADER, 'Bearer invalidtoken')
				.expect(400);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid refresh token');
		});
	});

	describe('API Keys Management', () => {
		let adminAccessToken: string;

		beforeAll(async () => {
			adminAccessToken = await loginUser();
		});

		afterAll(async () => {
			// Restore API key
			const apiKeyService = container.get(ApiKeyService);

			// Check if there are existing API keys and delete them
			const existingKeys = await apiKeyService.getApiKeys();

			if (existingKeys.length > 0) {
				await apiKeyService.deleteApiKeys();
			}

			await apiKeyService.initializeApiKey();
		});

		const getRoomsWithApiKey = async (apiKey: string) => {
			return request(app)
				.get(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, apiKey);
		};

		it('should create a new API key', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/api-keys`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.expect(201);

			expect(response.body).toHaveProperty('key');
			expect(response.body).toHaveProperty('creationDate');
			expect(response.body.key).toMatch(/^ovmeet-/);

			// Verify the API key works by making a request to the get rooms endpoint
			// using the newly created API key
			const apiResponse = await getRoomsWithApiKey(response.body.key);
			expect(apiResponse.status).toBe(200);
		});

		it('should get the list of API keys', async () => {
			await generateApiKey();
			const response = await getApiKeys();

			expect(Array.isArray(response.body)).toBe(true);

			if (response.body.length > 0) {
				expect(response.body[0]).toHaveProperty('key');
				expect(response.body[0]).toHaveProperty('creationDate');
			}
		});

		it('should only exist one API key at a time', async () => {
			const apiKey1 = await generateApiKey();
			const apiKey2 = await generateApiKey();
			const response = await getApiKeys();

			expect(response.body.length).toBe(1);
			expect(response.body[0].key).toBe(apiKey2); // The second key should replace the first

			// Verify the first API key no longer works
			let apiResponse = await getRoomsWithApiKey(apiKey1);
			expect(apiResponse.status).toBe(401);

			// Verify the second API key works
			apiResponse = await getRoomsWithApiKey(apiKey2);
			expect(apiResponse.status).toBe(200);
		});

		it('should delete all API keys', async () => {
			const apiKey = await generateApiKey();
			await request(app)
				.delete(`${AUTH_PATH}/api-keys`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.expect(200);

			// Confirm deletion
			const getResponse = await getApiKeys();
			expect(getResponse.status).toBe(200);
			expect(Array.isArray(getResponse.body)).toBe(true);
			expect(getResponse.body.length).toBe(0);

			// Verify the deleted API key no longer works
			const apiResponse = await getRoomsWithApiKey(apiKey);
			expect(apiResponse.status).toBe(401);
		});

		it('should succeed API key endpoints for authenticated admin user in cookie mode', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			await request(app).post(`${AUTH_PATH}/api-keys`).set('Cookie', adminCookie).expect(201);
			await request(app).get(`${AUTH_PATH}/api-keys`).set('Cookie', adminCookie).expect(200);
			await request(app).delete(`${AUTH_PATH}/api-keys`).set('Cookie', adminCookie).expect(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should reject API key endpoints for unauthenticated users', async () => {
			await request(app).post(`${AUTH_PATH}/api-keys`).expect(401);
			await request(app).get(`${AUTH_PATH}/api-keys`).expect(401);
			await request(app).delete(`${AUTH_PATH}/api-keys`).expect(401);
		});
	});
});
