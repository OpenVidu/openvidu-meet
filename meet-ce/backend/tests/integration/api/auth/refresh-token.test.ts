import { beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { startTestServer } from '../../../helpers/request-helpers.js';

const AUTH_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`;

describe('Authentication API Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
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
});
