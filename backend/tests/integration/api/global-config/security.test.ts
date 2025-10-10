import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetStorageService } from '../../../../src/services/index.js';
import { AuthMode, AuthTransportMode, AuthType } from '../../../../src/typings/ce/index.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { getSecurityConfig, startTestServer, updateSecurityConfig } from '../../../helpers/request-helpers.js';

const defaultConfig = {
	authentication: {
		authMethod: {
			type: AuthType.SINGLE_USER
		},
		authTransportMode: AuthTransportMode.HEADER,
		authModeToAccessRoom: AuthMode.NONE
	}
};

const restoreDefaultGlobalConfig = async () => {
	const defaultGlobalConfig = await container.get(MeetStorageService)['getDefaultConfig']();
	await container.get(MeetStorageService).saveGlobalConfig(defaultGlobalConfig);
};

describe('Security Config API Tests', () => {
	beforeAll(async () => {
		startTestServer();
	});

	afterEach(async () => {
		await restoreDefaultGlobalConfig();
	});

	describe('Update security config', () => {
		it('should update security config with valid complete data', async () => {
			const validConfig = {
				authentication: {
					authMethod: {
						type: AuthType.SINGLE_USER
					},
					authTransportMode: AuthTransportMode.HEADER,
					authModeToAccessRoom: AuthMode.ALL_USERS
				}
			};
			let response = await updateSecurityConfig(validConfig);

			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Security config updated successfully');

			response = await getSecurityConfig();
			expect(response.status).toBe(200);
			expect(response.body).toEqual(validConfig);
		});
	});

	describe('Update security config validation', () => {
		it('should reject when authModeToAccessRoom is not a valid enum value', async () => {
			const response = await updateSecurityConfig({
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
			const response = await updateSecurityConfig({
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
				"Invalid enum value. Expected 'single_user', received 'invalid'"
			);
		});

		it('should reject when authTransportMode is not a valid enum value', async () => {
			const response = await updateSecurityConfig({
				authentication: {
					authMethod: {
						type: AuthType.SINGLE_USER
					},
					authModeToAccessRoom: AuthMode.ALL_USERS,
					authTransportMode: 'invalid'
				}
			});

			expectValidationError(
				response,
				'authentication.authTransportMode',
				"Invalid enum value. Expected 'cookie' | 'header', received 'invalid'"
			);
		});

		it('should reject when authModeToAccessRoom, authTransportMode or authMethod are not provided', async () => {
			let response = await updateSecurityConfig({
				authentication: {
					authMode: AuthMode.NONE,
					authTransportMode: AuthTransportMode.HEADER
				}
			});
			expectValidationError(response, 'authentication.authMethod', 'Required');

			response = await updateSecurityConfig({
				authentication: {
					authMethod: {
						type: AuthType.SINGLE_USER
					},
					authModeToAccessRoom: AuthMode.NONE
				}
			});
			expectValidationError(response, 'authentication.authTransportMode', 'Required');

			response = await updateSecurityConfig({
				authentication: {
					authMethod: {
						type: AuthType.SINGLE_USER
					},
					authTransportMode: AuthTransportMode.HEADER
				}
			});
			expectValidationError(response, 'authentication.authModeToAccessRoom', 'Required');
		});

		it('should reject when authentication is not an object', async () => {
			const response = await updateSecurityConfig({
				authentication: 'invalid'
			});

			expectValidationError(response, 'authentication', 'Expected object, received string');
		});
	});

	describe('Get security config', () => {
		it('should return security config when authenticated as admin', async () => {
			const response = await getSecurityConfig();

			expect(response.status).toBe(200);
			expect(response.body).toEqual(defaultConfig);
		});
	});
});
