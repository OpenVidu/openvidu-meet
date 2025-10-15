import { beforeAll, describe, expect, it } from '@jest/globals';
import { getProfile, loginUser, startTestServer } from '../../../helpers/request-helpers.js';

describe('Users API Tests', () => {
	let adminAccessToken: string;

	beforeAll(async () => {
		startTestServer();
		adminAccessToken = await loginUser();
	});

	describe('Profile Tests', () => {
		it('should return 200 and admin profile', async () => {
			const response = await getProfile(adminAccessToken);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('username');
			expect(response.body.username).toBe('admin');
			expect(response.body).toHaveProperty('roles');
			expect(response.body.roles).toEqual(expect.arrayContaining(['admin', 'user']));
		});
	});
});
