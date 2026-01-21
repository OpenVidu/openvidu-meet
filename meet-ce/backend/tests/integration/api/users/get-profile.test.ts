import { beforeAll, describe, expect, it } from '@jest/globals';
import { getMe, loginAdminUser, startTestServer } from '../../../helpers/request-helpers.js';

describe('Users API Tests', () => {
	let adminAccessToken: string;

	beforeAll(async () => {
		await startTestServer();
		adminAccessToken = await loginAdminUser();
	});

	describe('Profile Tests', () => {
		it('should return 200 and admin profile', async () => {
			const response = await getMe(adminAccessToken);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('userId', 'admin');
			expect(response.body).toHaveProperty('name', 'Admin');
			expect(response.body).toHaveProperty('role', 'admin');
			expect(response.body).toHaveProperty('registrationDate');
		});
	});
});
