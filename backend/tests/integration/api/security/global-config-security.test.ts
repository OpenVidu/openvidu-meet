import { beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MEET_INITIAL_API_KEY } from '../../../../src/environment.js';
import { MeetStorageService } from '../../../../src/services/index.js';
import { AuthMode, AuthTransportMode, AuthType, MeetRoomThemeMode } from '../../../../src/typings/ce/index.js';
import { loginUser, startTestServer } from '../../../helpers/request-helpers.js';

const CONFIG_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/config`;

const restoreGlobalConfig = async () => {
	const storageService = container.get(MeetStorageService);
	await storageService['initializeGlobalConfig']();
};

describe('Global Config API Security Tests', () => {
	let app: Express;
	let adminCookie: string;

	beforeAll(async () => {
		app = startTestServer();
		adminCookie = await loginUser();
	});

	describe('Update Webhook Config Tests', () => {
		const webhookConfig = {
			enabled: true,
			url: 'https://example.com/webhook'
		};

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.put(`${CONFIG_PATH}/webhooks`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(webhookConfig);
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.put(`${CONFIG_PATH}/webhooks`)
				.set('Cookie', adminCookie)
				.send(webhookConfig);
			expect(response.status).toBe(200);

			await restoreGlobalConfig();
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${CONFIG_PATH}/webhooks`).send(webhookConfig);
			expect(response.status).toBe(401);
		});
	});

	describe('Get Webhook Config Tests', () => {
		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.get(`${CONFIG_PATH}/webhooks`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(`${CONFIG_PATH}/webhooks`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${CONFIG_PATH}/webhooks`);
			expect(response.status).toBe(401);
		});
	});

	describe('Update Security Config Tests', () => {
		const securityConfig = {
			authentication: {
				authMethod: {
					type: AuthType.SINGLE_USER
				},
				authTransportMode: AuthTransportMode.COOKIE,
				authModeToAccessRoom: AuthMode.ALL_USERS
			}
		};

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.put(`${CONFIG_PATH}/security`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(securityConfig);
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.put(`${CONFIG_PATH}/security`)
				.set('Cookie', adminCookie)
				.send(securityConfig);
			expect(response.status).toBe(200);

			await restoreGlobalConfig();
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${CONFIG_PATH}/security`).send(securityConfig);
			expect(response.status).toBe(401);
		});
	});

	describe('Get Security Config Tests', () => {
		it('should succeed when user is not authenticated', async () => {
			const response = await request(app).get(`${CONFIG_PATH}/security`);
			expect(response.status).toBe(200);
		});
	});

	describe('Update Rooms Appearance Config Tests', () => {
		const appearanceConfig = {
			appearance: {
				themes: [
					{
						name: 'default',
						enabled: true,
						baseTheme: MeetRoomThemeMode.DARK
					}
				]
			}
		};

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.put(`${CONFIG_PATH}/rooms/appearance`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(appearanceConfig);
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.put(`${CONFIG_PATH}/rooms/appearance`)
				.set('Cookie', adminCookie)
				.send(appearanceConfig);
			expect(response.status).toBe(200);

			await restoreGlobalConfig();
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${CONFIG_PATH}/rooms/appearance`).send(appearanceConfig);
			expect(response.status).toBe(401);
		});
	});

	describe('Get Rooms Appearance Config Tests', () => {
		it('should succeed when user is not authenticated', async () => {
			const response = await request(app).get(`${CONFIG_PATH}/rooms/appearance`);
			expect(response.status).toBe(200);
		});
	});
});
