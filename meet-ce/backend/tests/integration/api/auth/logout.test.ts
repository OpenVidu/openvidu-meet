import { beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import {
	getFullPath,
	getMe,
	loginRootAdmin,
	refreshTokenReq,
	startTestServer
} from '../../../helpers/request-helpers.js';

const AUTH_PATH = getFullPath(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`);

describe('Authentication API Tests', () => {
	let app: Express;
	let rootAdminAccessToken: string;

	beforeAll(async () => {
		app = await startTestServer();
		({ accessToken: rootAdminAccessToken } = await loginRootAdmin());
	});

	describe('Logout Tests', () => {
		it('should succeed with authentication', async () => {
			const response = await request(app)
				.post(`${AUTH_PATH}/logout`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, rootAdminAccessToken);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Logout successful');
		});

		it('should succeed without authentication', async () => {
			const response = await request(app).post(`${AUTH_PATH}/logout`);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toBe('Logout successful');
		});

		it('should end the session of the access token it receives, and only that one', async () => {
			const loggingOut = await loginRootAdmin();
			const staying = await loginRootAdmin();

			const response = await request(app)
				.post(`${AUTH_PATH}/logout`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, loggingOut.accessToken);
			expect(response.status).toBe(200);

			const meResponse = await getMe(loggingOut.accessToken);
			expect(meResponse.status).toBe(401);
			expect(meResponse.body.message).toBe('Invalid token');
			const refreshResponse = await refreshTokenReq(loggingOut.refreshToken);
			expect(refreshResponse.status).toBe(400);
			expect(refreshResponse.body.message).toBe('Invalid refresh token');

			expect((await getMe(staying.accessToken)).status).toBe(200);
			expect((await refreshTokenReq(staying.refreshToken)).status).toBe(200);
		});

		it('should end the session of the refresh token it receives', async () => {
			const { accessToken, refreshToken } = await loginRootAdmin();

			const response = await request(app)
				.post(`${AUTH_PATH}/logout`)
				.set(INTERNAL_CONFIG.REFRESH_TOKEN_HEADER, refreshToken);
			expect(response.status).toBe(200);

			expect((await getMe(accessToken)).status).toBe(401);
			expect((await refreshTokenReq(refreshToken)).status).toBe(400);
		});
	});
});
