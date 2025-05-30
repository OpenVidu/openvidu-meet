import { beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MEET_API_KEY } from '../../../../src/environment.js';
import { loginUser, startTestServer } from '../../../helpers/request-helpers.js';
import { AuthMode, AuthType } from '../../../../src/typings/ce/index.js';

const PREFERENCES_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/preferences`;

describe('Global Preferences API Security Tests', () => {
	let app: Express;
	let adminCookie: string;

	beforeAll(async () => {
		app = startTestServer();
		adminCookie = await loginUser();
	});

	describe('Update Webhook Preferences Tests', () => {
		const webhookPreferences = {
			enabled: true,
			url: 'https://example.com/webhook'
		};

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.put(`${PREFERENCES_PATH}/webhooks`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
				.send(webhookPreferences);
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.put(`${PREFERENCES_PATH}/webhooks`)
				.set('Cookie', adminCookie)
				.send(webhookPreferences);
			expect(response.status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${PREFERENCES_PATH}/webhooks`).send(webhookPreferences);
			expect(response.status).toBe(401);
		});
	});

	describe('Get Webhook Preferences Tests', () => {
		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.get(`${PREFERENCES_PATH}/webhooks`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(`${PREFERENCES_PATH}/webhooks`).set('Cookie', adminCookie);
			expect(response.status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${PREFERENCES_PATH}/webhooks`);
			expect(response.status).toBe(401);
		});
	});

	describe('Update Security Preferences Tests', () => {
		const securityPreferences = {
			authentication: {
				authMethod: {
					type: AuthType.SINGLE_USER
				},
				authModeToAccessRoom: AuthMode.ALL_USERS
			}
		};

		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.put(`${PREFERENCES_PATH}/security`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
				.send(securityPreferences);
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.put(`${PREFERENCES_PATH}/security`)
				.set('Cookie', adminCookie)
				.send(securityPreferences);
			expect(response.status).toBe(200);
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${PREFERENCES_PATH}/security`).send(securityPreferences);
			expect(response.status).toBe(401);
		});
	});

	describe('Get Security Preferences Tests', () => {
		it('should succeed when user is not authenticated', async () => {
			const response = await request(app).get(`${PREFERENCES_PATH}/security`);
			expect(response.status).toBe(200);
		});
	});

	describe('Update Appearance Preferences Tests', () => {
		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.put(`${PREFERENCES_PATH}/appearance`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY)
				.send({});
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app)
				.put(`${PREFERENCES_PATH}/appearance`)
				.set('Cookie', adminCookie)
				.send({});
			expect(response.status).toBe(402); // Assuming 402 is the expected status code for this case
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).put(`${PREFERENCES_PATH}/appearance`).send({});
			expect(response.status).toBe(401);
		});
	});

	describe('Get Appearance Preferences Tests', () => {
		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.get(`${PREFERENCES_PATH}/appearance`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_API_KEY);
			expect(response.status).toBe(401);
		});

		it('should succeed when user is authenticated as admin', async () => {
			const response = await request(app).get(`${PREFERENCES_PATH}/appearance`).set('Cookie', adminCookie);
			expect(response.status).toBe(402); // Assuming 402 is the expected status code for this case
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(`${PREFERENCES_PATH}/appearance`);
			expect(response.status).toBe(401);
		});
	});
});
