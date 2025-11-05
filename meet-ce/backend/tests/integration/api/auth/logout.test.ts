import { beforeAll, describe, expect, it } from '@jest/globals';
import { AuthTransportMode } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import {
	changeAuthTransportMode,
	extractCookieFromHeaders,
	startTestServer
} from '../../../helpers/request-helpers.js';

const AUTH_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`;

describe('Authentication API Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
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
});
