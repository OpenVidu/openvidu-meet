import { beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MEET_INITIAL_ADMIN_PASSWORD } from '../../../../src/environment.js';
import { AuthTransportMode } from '@openvidu-meet/typings';
import {
	changeAuthTransportMode,
	changePassword,
	loginUser,
	startTestServer
} from '../../../helpers/request-helpers.js';

const USERS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users`;

describe('User API Security Tests', () => {
	let app: Express;

	beforeAll(() => {
		app = startTestServer();
	});

	describe('Profile Tests', () => {
		let adminAccessToken: string;

		beforeAll(async () => {
			adminAccessToken = await loginUser();
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.get(`${USERS_PATH}/profile`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when user is authenticated as admin via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app).get(`${USERS_PATH}/profile`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${USERS_PATH}/profile`);
			expect(response.status).toBe(401);
		});
	});

	describe('Change Password Tests', () => {
		const changePasswordRequest = {
			currentPassword: MEET_INITIAL_ADMIN_PASSWORD,
			newPassword: 'newpassword123'
		};

		let adminAccessToken: string;

		beforeAll(async () => {
			adminAccessToken = await loginUser();
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.post(`${USERS_PATH}/change-password`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken)
				.send(changePasswordRequest);
			expect(response.status).toBe(200);

			// Reset password
			await changePassword(changePasswordRequest.newPassword, MEET_INITIAL_ADMIN_PASSWORD, adminAccessToken);
		});

		it('should succeed when user is authenticated as admin via cookie', async () => {
			// Set auth transport mode to cookie
			await changeAuthTransportMode(AuthTransportMode.COOKIE);

			// Login as admin to get access token cookie
			const adminCookie = await loginUser();

			const response = await request(app)
				.post(`${USERS_PATH}/change-password`)
				.set('Cookie', adminCookie)
				.send(changePasswordRequest);
			expect(response.status).toBe(200);

			// Reset password
			await changePassword(changePasswordRequest.newPassword, MEET_INITIAL_ADMIN_PASSWORD, adminCookie);

			// Revert auth transport mode to header
			await changeAuthTransportMode(AuthTransportMode.HEADER);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).post(`${USERS_PATH}/change-password`).send(changePasswordRequest);
			expect(response.status).toBe(401);
		});
	});
});
