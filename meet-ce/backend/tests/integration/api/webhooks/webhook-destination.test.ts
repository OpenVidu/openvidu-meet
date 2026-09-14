import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import type { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { getFullPath, startTestServer } from '../../../helpers/request-helpers.js';

const WEBHOOKS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/webhooks`);

describe('Webhooks API Tests (destination policy)', () => {
	let app: Express;
	const created: string[] = [];

	const withApiKey = (req: request.Test) => req.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
	const createWebhook = (url: string) => withApiKey(request(app).post(WEBHOOKS_PATH).send({ url }));
	const updateWebhook = (webhookId: string, url: string) =>
		withApiKey(request(app).put(`${WEBHOOKS_PATH}/${webhookId}`).send({ url }));
	const testWebhook = (webhookId: string) => withApiKey(request(app).post(`${WEBHOOKS_PATH}/${webhookId}/test`));
	const getWebhook = (webhookId: string) => withApiKey(request(app).get(`${WEBHOOKS_PATH}/${webhookId}`));

	const createAllowed = async (url: string): Promise<string> => {
		const response = await createWebhook(url);
		expect(response.status).toBe(201);
		created.push(response.body.webhookId);
		return response.body.webhookId;
	};

	beforeAll(async () => {
		app = await startTestServer();
	});

	afterEach(() => {
		MEET_ENV.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'true';
	});

	afterAll(async () => {
		await Promise.all(created.map((id) => withApiKey(request(app).delete(`${WEBHOOKS_PATH}/${id}`))));
	});

	it('refuses to register a webhook pointed at the cloud metadata endpoint', async () => {
		const response = await createWebhook('http://169.254.169.254/latest/meta-data/');

		expect(response.status).toBe(400);
		expect(response.body.error).toBe('Webhook Error');
		expect(response.body.message).toContain('not allowed');
	});

	it('refuses to move an existing webhook to a link-local address', async () => {
		const webhookId = await createAllowed('http://127.0.0.1:1/hook');

		const response = await updateWebhook(webhookId, 'http://[fe80::1]/hook');

		expect(response.status).toBe(400);
		expect((await getWebhook(webhookId)).body.url).toBe('http://127.0.0.1:1/hook');
	});

	it('accepts a private-network receiver by default and refuses it once private networks are disabled', async () => {
		await createAllowed('http://10.255.255.1:9/hook');

		MEET_ENV.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'false';
		const response = await createWebhook('http://192.168.0.1:9/hook');

		expect(response.status).toBe(400);
		expect(response.body.message).toContain('MEET_WEBHOOK_ALLOW_PRIVATE_NETWORKS');
	});

	it('refuses to deliver a test event to a destination that is no longer allowed', async () => {
		const webhookId = await createAllowed('http://127.0.0.1:1/hook');
		const whileAllowed = await testWebhook(webhookId);
		expect(whileAllowed.status).toBe(400);
		expect(whileAllowed.body.message).toContain('is invalid');

		MEET_ENV.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'false';
		const started = Date.now();
		const onceForbidden = await testWebhook(webhookId);

		expect(onceForbidden.status).toBe(400);
		expect(onceForbidden.body.message).toContain('not allowed');
		expect(Date.now() - started).toBeLessThan(INTERNAL_CONFIG.WEBHOOK_REQUEST_TIMEOUT);
	});
});
