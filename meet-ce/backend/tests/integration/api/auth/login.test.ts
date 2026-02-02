import { beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { getFullPath, startTestServer } from '../../../helpers/request-helpers.js';

const AUTH_PATH = getFullPath(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`);

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
});
