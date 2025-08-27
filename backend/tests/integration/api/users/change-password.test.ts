import { beforeAll, describe, expect, it } from '@jest/globals';
import { MEET_INITIAL_ADMIN_PASSWORD } from '../../../../src/environment.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { changePassword, loginUser, startTestServer } from '../../../helpers/request-helpers.js';

describe('Users API Tests', () => {
	let adminCookie: string;

	beforeAll(async () => {
		startTestServer();
		adminCookie = await loginUser();
	});

	describe('Change Password Tests', () => {
		it('should successfully change password', async () => {
			const newPassword = 'newpassword123';
			const response = await changePassword(MEET_INITIAL_ADMIN_PASSWORD, newPassword, adminCookie);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message', 'Password changed successfully');

			// Reset password
			await changePassword(newPassword, MEET_INITIAL_ADMIN_PASSWORD, adminCookie);
		});

		it('should fail when current password is incorrect', async () => {
			const response = await changePassword('wrongpassword', 'newpassword123', adminCookie);
			expect(response.status).toBe(400);
			expect(response.body).toHaveProperty('message', 'Invalid current password');
		});

		it('should fail when new password is not 5 characters long', async () => {
			const response = await changePassword(MEET_INITIAL_ADMIN_PASSWORD, '1234', adminCookie);
			expectValidationError(response, 'newPassword', 'New password must be at least 5 characters long');
		});
	});
});
