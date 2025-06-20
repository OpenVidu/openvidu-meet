import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { MEET_ADMIN_SECRET } from '../../../../src/environment.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { changePassword, loginUser, startTestServer } from '../../../helpers/request-helpers.js';

describe('Users API Tests', () => {
	let adminCookie: string;

	beforeAll(async () => {
		startTestServer();
		adminCookie = await loginUser();
	});

	afterEach(async () => {
		// Reset password
		await changePassword(MEET_ADMIN_SECRET, adminCookie);
	});

	describe('Change Password Tests', () => {
		it('should successfully change password', async () => {
			const response = await changePassword('newpassword123', adminCookie);
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('message', 'Password changed successfully');
		});

		it('should fail when new password is not 4 characters long', async () => {
			const response = await changePassword('123', adminCookie);
			expectValidationError(response, 'newPassword', 'New password must be at least 4 characters long');
		});
	});
});
