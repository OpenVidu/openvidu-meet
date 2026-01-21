import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { SecurityConfig } from '@openvidu-meet/typings';
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
			const validConfig: SecurityConfig = {
				authentication: {
					allowUserCreation: true,
					oauthProviders: []
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
		it('should reject when allowUserCreation is not a boolean', async () => {
			const response = await updateSecurityConfig({
				authentication: {
					allowUserCreation: 'invalid'
				}
			} as unknown as SecurityConfig);
			expectValidationError(response, 'authentication.allowUserCreation', 'Expected boolean, received string');
		});

		it('should reject when oauthProviders is not an array', async () => {
			const response = await updateSecurityConfig({
				authentication: {
					allowUserCreation: true,
					oauthProviders: 'invalid'
				}
			} as unknown as SecurityConfig);
			expectValidationError(response, 'authentication.oauthProviders', 'Expected array, received string');
		});

		it('should reject when allowUserCreation is not provided', async () => {
			const response = await updateSecurityConfig({
				authentication: {
					oauthProviders: []
				}
			} as unknown as SecurityConfig);
			expectValidationError(response, 'authentication.allowUserCreation', 'Required');
		});

		it('should reject when oauthProviders is not provided', async () => {
			const response = await updateSecurityConfig({
				authentication: {
					allowUserCreation: true
				}
			} as SecurityConfig);
			expectValidationError(response, 'authentication.oauthProviders', 'Required');
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
			const defaultConfig: SecurityConfig = {
				authentication: {
					allowUserCreation: true,
					oauthProviders: []
				}
			};

			const response = await getSecurityConfig();
			expect(response.status).toBe(200);
			expect(response.body).toEqual(defaultConfig);
		});
	});
});
