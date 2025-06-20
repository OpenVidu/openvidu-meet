import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MEET_ADMIN_SECRET } from '../../../../src/environment.js';
import { changePassword, loginUser, startTestServer } from '../../../helpers/request-helpers.js';

const USERS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users`;

describe('User API Security Tests', () => {
	let app: Express;

	beforeAll(() => {
		app = startTestServer();
	});

	describe('Profile Tests', () => {
		let adminCookie: string;

		beforeAll(async () => {
			adminCookie = await loginUser();
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(`${USERS_PATH}/profile`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${USERS_PATH}/profile`);
			expect(response.status).toBe(401);
		});
	});

	describe('Change Password Tests', () => {
		const changePasswordRequest = {
			newPassword: 'newpassword123'
		};

		let adminCookie: string;

		beforeAll(async () => {
			adminCookie = await loginUser();
		});

		afterEach(async () => {
			// Reset password
			await changePassword(MEET_ADMIN_SECRET, adminCookie);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.post(`${USERS_PATH}/change-password`)
				.set('Cookie', adminCookie)
				.send(changePasswordRequest);
			expect(response.status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).post(`${USERS_PATH}/change-password`).send(changePasswordRequest);
			expect(response.status).toBe(401);
		});
	});
});
