import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetStorageService } from '../../../../src/services/index.js';
import { AuthMode, AuthType } from '../../../../src/typings/ce/index.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	getSecurityPreferences,
	startTestServer,
	updateSecurityPreferences
} from '../../../helpers/request-helpers.js';

const defaultPreferences = {
	authentication: {
		authMethod: {
			type: AuthType.SINGLE_USER
		},
		authModeToAccessRoom: AuthMode.NONE
	}
};

const restoreDefaultGlobalPreferences = async () => {
	const defaultPref = await container.get(MeetStorageService)['getDefaultPreferences']();
	await container.get(MeetStorageService).saveGlobalPreferences(defaultPref);
};

describe('Security Preferences API Tests', () => {
	beforeAll(async () => {
		startTestServer();
	});

	afterEach(async () => {
		await restoreDefaultGlobalPreferences();
	});

	describe('Update security preferences', () => {
		it('should update security preferences with valid complete data', async () => {
			const validPreferences = {
				authentication: {
					authMethod: {
						type: AuthType.SINGLE_USER
					},
					authModeToAccessRoom: AuthMode.ALL_USERS
				}
			};
			let response = await updateSecurityPreferences(validPreferences);

			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Security preferences updated successfully');

			response = await getSecurityPreferences();
			expect(response.status).toBe(200);
			expect(response.body).toEqual(validPreferences);
		});
	});

	describe('Update security preferences validation', () => {
		it('should reject when authModeToAccessRoom is not a valid enum value', async () => {
			const response = await updateSecurityPreferences({
				authentication: {
					authMethod: {
						type: AuthType.SINGLE_USER
					},
					authModeToAccessRoom: 'invalid'
				}
			});

			expectValidationError(
				response,
				'authentication.authModeToAccessRoom',
				"Invalid enum value. Expected 'none' | 'moderators_only' | 'all_users', received 'invalid'"
			);
		});

		it('should reject when authType is not a valid enum value', async () => {
			const response = await updateSecurityPreferences({
				authentication: {
					authMethod: {
						type: 'invalid'
					},
					authModeToAccessRoom: AuthMode.ALL_USERS
				}
			});

			expectValidationError(
				response,
				'authentication.authMethod.type',
				"Invalid enum value. Expected 'single-user', received 'invalid'"
			);
		});

		it('should reject when authModeToAccessRoom or authMethod are not provided', async () => {
			let response = await updateSecurityPreferences({
				authentication: {
					authMode: AuthMode.NONE
				}
			});
			expectValidationError(response, 'authentication.authMethod', 'Required');

			response = await updateSecurityPreferences({
				authentication: {
					method: {
						type: AuthType.SINGLE_USER
					}
				}
			});
			expectValidationError(response, 'authentication.authModeToAccessRoom', 'Required');
		});

		it('should reject when authentication is not an object', async () => {
			const response = await updateSecurityPreferences({
				authentication: 'invalid'
			});

			expectValidationError(response, 'authentication', 'Expected object, received string');
		});
	});

	describe('Get security preferences', () => {
		it('should return security preferences when authenticated as admin', async () => {
			const response = await getSecurityPreferences();

			expect(response.status).toBe(200);
			expect(response.body).toEqual(defaultPreferences);
		});
	});
});
