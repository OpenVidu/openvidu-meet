import { beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { getFullPath, startTestServer } from '../../../helpers/request-helpers.js';

const AUTH_PATH = getFullPath(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/auth`);

describe('Authentication API Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
	});

	describe('Logout Tests', () => {
		it('should successfully logout', async () => {
			const response = await request(app).post(`${AUTH_PATH}/logout`).expect(200);

			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toBe('Logout successful');
		});
	});
});
