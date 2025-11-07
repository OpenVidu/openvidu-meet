import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { AuthMode, AuthTransportMode, AuthType, SecurityConfig } from '@openvidu-meet/typings';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	getSecurityConfig,
	restoreDefaultGlobalConfig,
	startTestServer,
	updateSecurityConfig
} from '../../../helpers/request-helpers.js';

describe('Security Config API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
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
			} as unknown as SecurityConfig);

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
			} as unknown as SecurityConfig);

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
			} as unknown as SecurityConfig);

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
			} as unknown as SecurityConfig);
			expectValidationError(response, 'authentication.authMethod', 'Required');

			response = await updateSecurityConfig({
				authentication: {
					authMethod: {
						type: AuthType.SINGLE_USER
					},
					authModeToAccessRoom: AuthMode.NONE
				}
			} as unknown as SecurityConfig);
			expectValidationError(response, 'authentication.authTransportMode', 'Required');

			response = await updateSecurityConfig({
				authentication: {
					authMethod: {
						type: AuthType.SINGLE_USER
					},
					authTransportMode: AuthTransportMode.HEADER
				}
			} as unknown as SecurityConfig);
			expectValidationError(response, 'authentication.authModeToAccessRoom', 'Required');
		});

		it('should reject when authentication is not an object', async () => {
			const response = await updateSecurityConfig({
				authentication: 'invalid'
			} as unknown as SecurityConfig);

			expectValidationError(response, 'authentication', 'Expected object, received string');
		});
	});

	describe('Get security config', () => {
		it('should return security config when authenticated as admin', async () => {
			const defaultConfig = {
				authentication: {
					authMethod: {
						type: AuthType.SINGLE_USER
					},
					authTransportMode: AuthTransportMode.HEADER,
					authModeToAccessRoom: AuthMode.NONE
				}
			};

			const response = await getSecurityConfig();
			expect(response.status).toBe(200);
			expect(response.body).toEqual(defaultConfig);
		});
	});
});
