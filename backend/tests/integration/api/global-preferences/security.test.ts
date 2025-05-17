import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	getSecurityPreferences,
	startTestServer,
	updateSecurityPreferences
} from '../../../helpers/request-helpers.js';
import { AuthMode, AuthType } from '../../../../src/typings/ce/index.js';

const defaultPreferences = {
	roomCreationPolicy: {
		allowRoomCreation: true,
		requireAuthentication: true
	},
	authentication: {
		authMode: AuthMode.NONE,
		method: {
			type: AuthType.SINGLE_USER
		}
	}
};

const restoreDefaultSecurityPreferences = async () => {
	await updateSecurityPreferences(defaultPreferences);
};

describe('Security Preferences API Tests', () => {
	beforeAll(() => {
		startTestServer();
	});

	afterEach(async () => {
		await restoreDefaultSecurityPreferences();
	});

	describe('Update security preferences', () => {
		it('should update security preferences with valid complete data', async () => {
			const validPreferences = {
				roomCreationPolicy: {
					allowRoomCreation: true,
					requireAuthentication: true
				},
				authentication: {
					authMode: AuthMode.ALL_USERS,
					method: {
						type: AuthType.SINGLE_USER
					}
				}
			};
			let response = await updateSecurityPreferences(validPreferences);

			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Security preferences updated successfully');

			response = await getSecurityPreferences();
			expect(response.status).toBe(200);
			expect(response.body).toEqual(validPreferences);
		});

		it('should update security preferences with valid partial data (roomCreationPolicy)', async () => {
			const validPreferences = {
				roomCreationPolicy: {
					allowRoomCreation: false
				}
			};
			let response = await updateSecurityPreferences(validPreferences);

			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Security preferences updated successfully');

			response = await getSecurityPreferences();
			expect(response.status).toBe(200);
			expect(response.body.roomCreationPolicy.allowRoomCreation).toEqual(
				validPreferences.roomCreationPolicy.allowRoomCreation
			);
			expect(response.body.authentication).toEqual(defaultPreferences.authentication);
		});

		it('should update security preferences with valid partial data (authentication)', async () => {
			const validPreferences = {
				authentication: {
					authMode: AuthMode.ALL_USERS,
					method: {
						type: AuthType.SINGLE_USER
					}
				}
			};
			let response = await updateSecurityPreferences(validPreferences);

			expect(response.status).toBe(200);
			expect(response.body.message).toBe('Security preferences updated successfully');

			response = await getSecurityPreferences();
			expect(response.status).toBe(200);
			expect(response.body.authentication).toEqual(validPreferences.authentication);
			expect(response.body.roomCreationPolicy).toEqual(defaultPreferences.roomCreationPolicy);
		});
	});

	describe('Update security preferences validation', () => {
		it('should reject when allowRoomCreation is not a boolean', async () => {
			const response = await updateSecurityPreferences({
				roomCreationPolicy: {
					allowRoomCreation: 'invalid',
					requireAuthentication: true
				}
			});

			expectValidationError(
				response,
				'roomCreationPolicy.allowRoomCreation',
				'Expected boolean, received string'
			);
		});

		it('should reject when requireAuthentication is not a boolean', async () => {
			const response = await updateSecurityPreferences({
				roomCreationPolicy: {
					allowRoomCreation: true,
					requireAuthentication: 'invalid'
				}
			});

			expectValidationError(
				response,
				'roomCreationPolicy.requireAuthentication',
				'Expected boolean, received string'
			);
		});

		it('should reject when allowRoomCreation is not provided', async () => {
			const response = await updateSecurityPreferences({
				roomCreationPolicy: {
					requireAuthentication: true
				}
			});
			expectValidationError(response, 'roomCreationPolicy.allowRoomCreation', 'Required');
		});

		it('should reject when allowRoomCreation is true and requireAuthentication is not provided', async () => {
			const response = await updateSecurityPreferences({
				roomCreationPolicy: {
					allowRoomCreation: true
				}
			});
			expectValidationError(
				response,
				'roomCreationPolicy.requireAuthentication',
				'requireAuthentication is required when allowRoomCreation is true'
			);
		});

		it('should reject when authMode is not a valid enum value', async () => {
			const response = await updateSecurityPreferences({
				authentication: {
					authMode: 'invalid',
					method: {
						type: AuthType.SINGLE_USER
					}
				}
			});

			expectValidationError(
				response,
				'authentication.authMode',
				"Invalid enum value. Expected 'none' | 'moderators_only' | 'all_users', received 'invalid'"
			);
		});

		it('should reject when authType is not a valid enum value', async () => {
			const response = await updateSecurityPreferences({
				authentication: {
					authMode: AuthMode.NONE,
					method: {
						type: 'invalid'
					}
				}
			});

			expectValidationError(
				response,
				'authentication.method.type',
				"Invalid enum value. Expected 'single-user', received 'invalid'"
			);
		});

		it('should reject when authMode or method are not provided', async () => {
			let response = await updateSecurityPreferences({
				authentication: {
					authMode: AuthMode.NONE
				}
			});
			expectValidationError(response, 'authentication.method', 'Required');

			response = await updateSecurityPreferences({
				authentication: {
					method: {
						type: AuthType.SINGLE_USER
					}
				}
			});
			expectValidationError(response, 'authentication.authMode', 'Required');
		});

		it('should reject when roomCreationPolicy is not an object', async () => {
			const response = await updateSecurityPreferences({
				roomCreationPolicy: 'invalid'
			});

			expectValidationError(response, 'roomCreationPolicy', 'Expected object, received string');
		});

		it('should reject when authentication is not an object', async () => {
			const response = await updateSecurityPreferences({
				authentication: 'invalid'
			});

			expectValidationError(response, 'authentication', 'Expected object, received string');
		});

		it('should reject when both roomCreationPolicy and authentication are not provided', async () => {
			const response = await updateSecurityPreferences({});

			expectValidationError(response, '', 'At least one field must be provided for the update');
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
