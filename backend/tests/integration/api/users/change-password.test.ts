import { beforeAll, describe, expect, it } from '@jest/globals';
import { MEET_INITIAL_ADMIN_PASSWORD } from '../../../../src/environment.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { changePassword, loginUser, startTestServer } from '../../../helpers/request-helpers.js';

describe('Users API Tests', () => {
	let adminAccessToken: string;

	beforeAll(async () => {
		startTestServer();
		adminAccessToken = await loginUser();
	});

	describe('Change Password Tests', () => {
		it('should successfully change password', async () => {
			const newPassword = 'newpassword123';
			const response = await changePassword(MEET_INITIAL_ADMIN_PASSWORD, newPassword, adminAccessToken);
			expect(response.status).toBe(200);

			// Reset password
			await changePassword(newPassword, MEET_INITIAL_ADMIN_PASSWORD, adminAccessToken);
		});

		it('should fail when current password is incorrect', async () => {
			const response = await changePassword('wrongpassword', 'newpassword123', adminAccessToken);
			expect(response.status).toBe(400);
			expect(response.body).toHaveProperty('message', 'Invalid current password');
		});

		it('should fail when new password is not 5 characters long', async () => {
			const response = await changePassword(MEET_INITIAL_ADMIN_PASSWORD, '1234', adminAccessToken);
			expectValidationError(response, 'newPassword', 'New password must be at least 5 characters long');
		});
	});
});
