import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { errorInsufficientPermissions, errorUnauthorized } from '../../../../src/models/error.model.js';
import { expectMeetError } from '../../../helpers/assertion-helpers.js';
import { deleteAllUsers, getFullPath, startTestServer } from '../../../helpers/request-helpers.js';
import { setupTestUsers } from '../../../helpers/test-scenarios.js';
import { TestUsers } from '../../../interfaces/scenarios.js';

const ANALYTICS_PATH = getFullPath(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/analytics`);

describe('Analytics API Security Tests', () => {
	let app: Express;
	let testUsers: TestUsers;

	beforeAll(async () => {
		app = await startTestServer();
		testUsers = await setupTestUsers();
	});

	afterAll(async () => {
		await deleteAllUsers();
	});

	describe('Get Analytics Tests', () => {
		it('should fail when request includes API key', async () => {
			const response = await request(app)
				.get(ANALYTICS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expectMeetError(response, errorUnauthorized());
		});

		it('should succeed when user is authenticated as ADMIN', async () => {
			const response = await request(app)
				.get(ANALYTICS_PATH)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expect(response.status).toBe(200);
		});

		it('should fail when user is authenticated as ROOM_MANAGER', async () => {
			const response = await request(app)
				.get(ANALYTICS_PATH)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomManager.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is authenticated as ROOM_MEMBER', async () => {
			const response = await request(app)
				.get(ANALYTICS_PATH)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail when user is not authenticated', async () => {
			const response = await request(app).get(ANALYTICS_PATH);
			expectMeetError(response, errorUnauthorized());
		});
	});
});
