import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import type { MeetWebhook, MeetWebhookOptions } from '@openvidu-meet/typings';
import { MeetWebhookEventType } from '@openvidu-meet/typings';
import { Express } from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { INTERNAL_CONFIG, setInternalConfig } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { getFullPath, loginRootAdmin, startTestServer } from '../../../helpers/request-helpers.js';

const WEBHOOKS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/webhooks`);

describe('Webhooks API Tests (CRUD)', () => {
	let app: Express;
	let adminAccessToken: string;

	const withApiKey = (req: request.Test) => req.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);

	const createWebhook = (options: Partial<MeetWebhookOptions>) =>
		withApiKey(request(app).post(WEBHOOKS_PATH).send(options));

	const listWebhooks = () => withApiKey(request(app).get(WEBHOOKS_PATH));

	const getWebhook = (webhookId: string) => withApiKey(request(app).get(`${WEBHOOKS_PATH}/${webhookId}`));

	const updateWebhook = (webhookId: string, options: Partial<MeetWebhookOptions>) =>
		withApiKey(request(app).put(`${WEBHOOKS_PATH}/${webhookId}`).send(options));

	const deleteWebhook = (webhookId: string) => withApiKey(request(app).delete(`${WEBHOOKS_PATH}/${webhookId}`));

	const deleteAllWebhooks = async () => {
		const response = await listWebhooks();
		const { webhooks } = response.body as { webhooks: MeetWebhook[] };
		await Promise.all(webhooks.map((webhook) => deleteWebhook(webhook.webhookId)));
	};

	beforeAll(async () => {
		app = await startTestServer();
		({ accessToken: adminAccessToken } = await loginRootAdmin());
	});

	afterEach(async () => {
		await deleteAllWebhooks();
	});

	afterAll(async () => {
		await deleteAllWebhooks();
	});

	describe('Authentication', () => {
		it('should fail with 401 without credentials', async () => {
			let response = await request(app).get(WEBHOOKS_PATH);
			expect(response.status).toBe(401);

			response = await request(app).post(WEBHOOKS_PATH).send({ url: 'https://example.com/hook' });
			expect(response.status).toBe(401);
		});

		it('should accept an admin access token', async () => {
			const response = await request(app)
				.get(WEBHOOKS_PATH)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, adminAccessToken);
			expect(response.status).toBe(200);
		});
	});

	describe('Create Webhook Tests', () => {
		it('should register a webhook applying the defaults', async () => {
			const response = await createWebhook({ url: 'https://example.com/hook' });
			expect(response.status).toBe(201);

			const webhook = response.body as MeetWebhook;
			expect(webhook.webhookId).toMatch(/^wh-/);
			expect(webhook.url).toBe('https://example.com/hook');
			expect(webhook.enabled).toBe(true);
			expect(webhook.events).toBeUndefined();
			expect(webhook.roomId).toBeUndefined();
			expect(webhook.creationDate).toBeLessThanOrEqual(Date.now());
		});

		it('should register a webhook with event and room filters', async () => {
			const response = await createWebhook({
				url: 'https://example.com/hook',
				events: [MeetWebhookEventType.PARTICIPANT_JOINED, MeetWebhookEventType.PARTICIPANT_LEFT],
				roomId: 'room-123',
				enabled: false
			});
			expect(response.status).toBe(201);

			const webhook = response.body as MeetWebhook;
			expect(webhook.events).toEqual([
				MeetWebhookEventType.PARTICIPANT_JOINED,
				MeetWebhookEventType.PARTICIPANT_LEFT
			]);
			expect(webhook.roomId).toBe('room-123');
			expect(webhook.enabled).toBe(false);
		});

		it('should reject an invalid payload with 422', async () => {
			// Not an http(s) URL
			let response = await createWebhook({ url: 'ftp://example.com/hook' });
			expect(response.status).toBe(422);

			// Missing URL
			response = await createWebhook({});
			expect(response.status).toBe(422);

			// Empty events array (omitting the field is the way to receive every event)
			response = await createWebhook({ url: 'https://example.com/hook', events: [] as never });
			expect(response.status).toBe(422);

			// Unknown event type
			response = await createWebhook({ url: 'https://example.com/hook', events: ['somethingElse'] as never });
			expect(response.status).toBe(422);
		});

		it('should reject registrations beyond the webhook limit with 409', async () => {
			const originalLimit = INTERNAL_CONFIG.WEBHOOK_MAX_ENDPOINTS;
			setInternalConfig({ WEBHOOK_MAX_ENDPOINTS: 2 });

			try {
				await createWebhook({ url: 'https://example.com/hook-1' }).expect(201);
				await createWebhook({ url: 'https://example.com/hook-2' }).expect(201);

				const response = await createWebhook({ url: 'https://example.com/hook-3' });
				expect(response.status).toBe(409);
				expect(response.body.message).toContain('maximum number');
			} finally {
				setInternalConfig({ WEBHOOK_MAX_ENDPOINTS: originalLimit });
			}
		});
	});

	describe('Get Webhook Tests', () => {
		it('should list the registered webhooks', async () => {
			await createWebhook({ url: 'https://example.com/hook-1' }).expect(201);
			await createWebhook({ url: 'https://example.com/hook-2' }).expect(201);

			const response = await listWebhooks();
			expect(response.status).toBe(200);

			const { webhooks } = response.body as { webhooks: MeetWebhook[] };
			expect(webhooks).toHaveLength(2);
			expect(webhooks.map((webhook) => webhook.url).sort()).toEqual([
				'https://example.com/hook-1',
				'https://example.com/hook-2'
			]);
		});

		it('should return a webhook by its ID', async () => {
			const created = (await createWebhook({ url: 'https://example.com/hook' }).expect(201)).body as MeetWebhook;

			const response = await getWebhook(created.webhookId);
			expect(response.status).toBe(200);
			expect(response.body).toEqual(created);
		});

		it('should fail with 404 for a webhook that does not exist', async () => {
			const response = await getWebhook('wh-does-not-exist');
			expect(response.status).toBe(404);
		});
	});

	describe('Update Webhook Tests', () => {
		it('should replace the webhook definition, clearing omitted fields', async () => {
			const created = (
				await createWebhook({
					url: 'https://example.com/hook',
					events: [MeetWebhookEventType.RECORDING_ENDED],
					roomId: 'room-123'
				}).expect(201)
			).body as MeetWebhook;

			// PUT without events/roomId: both filters are cleared, not preserved
			const response = await updateWebhook(created.webhookId, {
				url: 'https://example.com/hook-v2',
				enabled: false
			});
			expect(response.status).toBe(200);

			const updated = response.body as MeetWebhook;
			expect(updated.webhookId).toBe(created.webhookId);
			expect(updated.url).toBe('https://example.com/hook-v2');
			expect(updated.enabled).toBe(false);
			expect(updated.events).toBeUndefined();
			expect(updated.roomId).toBeUndefined();
			expect(updated.creationDate).toBe(created.creationDate);
		});

		it('should fail with 404 when updating a webhook that does not exist', async () => {
			const response = await updateWebhook('wh-does-not-exist', { url: 'https://example.com/hook' });
			expect(response.status).toBe(404);
		});

		it('should reject an invalid payload with 422', async () => {
			const created = (await createWebhook({ url: 'https://example.com/hook' }).expect(201)).body as MeetWebhook;

			const response = await updateWebhook(created.webhookId, { url: 'not-a-url' });
			expect(response.status).toBe(422);
		});
	});

	describe('Delete Webhook Tests', () => {
		it('should delete a webhook', async () => {
			const created = (await createWebhook({ url: 'https://example.com/hook' }).expect(201)).body as MeetWebhook;

			const response = await deleteWebhook(created.webhookId);
			expect(response.status).toBe(200);

			await getWebhook(created.webhookId).expect(404);
		});

		it('should fail with 404 when deleting a webhook that does not exist', async () => {
			const response = await deleteWebhook('wh-does-not-exist');
			expect(response.status).toBe(404);
		});
	});

	describe('Test Webhook Tests', () => {
		it('should send a signed test event to the stored URL', async () => {
			// A local HTTP server stands in for the integrator's endpoint.
			const receivedRequests: Array<{ signature?: string; timestamp?: string }> = [];
			const receiver = http.createServer((req, res) => {
				receivedRequests.push({
					signature: req.headers['x-signature'] as string | undefined,
					timestamp: req.headers['x-timestamp'] as string | undefined
				});
				res.writeHead(200).end();
			});
			await new Promise<void>((resolve) => receiver.listen(0, resolve));
			const { port } = receiver.address() as AddressInfo;

			try {
				const created = (await createWebhook({ url: `http://localhost:${port}/hook` }).expect(201))
					.body as MeetWebhook;

				const response = await withApiKey(request(app).post(`${WEBHOOKS_PATH}/${created.webhookId}/test`));
				expect(response.status).toBe(200);

				expect(receivedRequests).toHaveLength(1);
				expect(receivedRequests[0].signature).toBeDefined();
				expect(receivedRequests[0].timestamp).toBeDefined();
			} finally {
				await new Promise<void>((resolve, reject) =>
					receiver.close((error) => (error ? reject(error) : resolve()))
				);
			}
		});

		it('should fail with 400 when the stored URL is unreachable', async () => {
			const created = (await createWebhook({ url: 'http://localhost:1/unreachable' }).expect(201))
				.body as MeetWebhook;

			const response = await withApiKey(request(app).post(`${WEBHOOKS_PATH}/${created.webhookId}/test`));
			expect(response.status).toBe(400);
		});

		it('should fail with 404 when testing a webhook that does not exist', async () => {
			const response = await withApiKey(request(app).post(`${WEBHOOKS_PATH}/wh-does-not-exist/test`));
			expect(response.status).toBe(404);
		});
	});
});
