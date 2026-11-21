import { MeetApiKey, MeetWebhook, MeetWebhookEventType, MeetWebhookOptions } from '@openvidu-meet/typings';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInAdminBeforeEach } from '../helpers/console.helper';
import { MEET_BASE_URL } from '../helpers/meet-api.helper';

signInAdminBeforeEach();

const API_KEYS_URL = /\/internal-api\/v1\/api-keys$/;
const WEBHOOKS_URL = /\/api\/v1\/webhooks$/;
const WEBHOOK_URL = /\/api\/v1\/webhooks\/[^/]+$/;
const WEBHOOK_TEST_URL = /\/api\/v1\/webhooks\/[^/]+\/test$/;

const makeWebhook = (webhookId: string, options: Partial<MeetWebhook> = {}): MeetWebhook => ({
	webhookId,
	url: `https://hooks.example.com/${webhookId}`,
	enabled: true,
	creationDate: Date.now(),
	...options
});

/** Serves the API key the console reads and changes from a state of its own, never the deployment's real key. */
const fakeApiKey = async (page: Page, initial?: MeetApiKey) => {
	let apiKey = initial;
	const requests: string[] = [];
	let generated = 0;

	await page.route(API_KEYS_URL, async (route) => {
		const method = route.request().method();
		requests.push(method);

		if (method === 'POST') {
			apiKey = { key: `ovmeet-fake-key-${++generated}`, creationDate: Date.now() };
			await route.fulfill({ status: 201, json: apiKey });
		} else if (method === 'DELETE') {
			apiKey = undefined;
			await route.fulfill({ status: 200, json: { message: 'API keys deleted' } });
		} else {
			await route.fulfill({ json: apiKey ? [apiKey] : [] });
		}
	});

	return requests;
};

/** Serves the webhooks the console lists and updates from a state of its own, recording what it sends. */
const fakeWebhooks = async (page: Page, initial: MeetWebhook[]) => {
	const webhooks = [...initial];
	const updates: MeetWebhookOptions[] = [];

	await page.route(WEBHOOKS_URL, async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();

		await route.fulfill({ json: { webhooks } });
	});
	await page.route(WEBHOOK_URL, async (route) => {
		if (route.request().method() !== 'PUT') return route.fallback();

		const options = route.request().postDataJSON() as MeetWebhookOptions;
		const webhookId = new URL(route.request().url()).pathname.split('/').pop();
		const index = webhooks.findIndex((webhook) => webhook.webhookId === webhookId);
		webhooks[index] = { ...webhooks[index], ...options };
		updates.push(options);
		await route.fulfill({ json: webhooks[index] });
	});

	return updates;
};

const gotoEmbedded = async (page: Page): Promise<void> => {
	await page.goto(`${MEET_BASE_URL}/embedded`, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { name: 'Embedded', exact: true })).toBeVisible({ timeout: 20_000 });
};

const notification = (page: Page, text: string): Locator =>
	page.locator('.ov-notification[data-kind="message"]', { hasText: text });

const apiKeyField = (page: Page): Locator => page.locator('.api-key-field input');

const generatedOn = (page: Page): Locator => page.locator('#api-key-generated-on');

test.describe('Console Embedded page placeholders E2E Tests', () => {
	test('shows its title and both sections with placeholders while loading', async ({ page }) => {
		let release!: () => void;
		const released = new Promise<void>((resolve) => (release = resolve));
		await page.route(API_KEYS_URL, async (route) => {
			await released;
			await route.fulfill({ json: [] });
		});
		await page.route(WEBHOOKS_URL, async (route) => {
			await released;
			await route.fulfill({ json: { webhooks: [] } });
		});

		await gotoEmbedded(page);

		await expect(page.locator('.api-key-section mat-card-title')).toHaveText('API KEY');
		await expect(page.locator('.webhooks-section mat-card-title')).toHaveText('WEBHOOKS');
		await expect(page.locator('.api-key-section ov-skeleton-rows .row')).toHaveCount(1);
		await expect(page.locator('.webhooks-section ov-skeleton-rows .row')).toHaveCount(3);

		release();

		await expect(page.locator('ov-skeleton-rows')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Generate API Key' })).toBeVisible();
	});
});

test.describe('Console Embedded page API key E2E Tests', () => {
	test('generating the first key shows it revealed and offers to regenerate or revoke it', async ({ page }) => {
		const requests = await fakeApiKey(page);
		await fakeWebhooks(page, []);
		await gotoEmbedded(page);

		await page.getByRole('button', { name: 'Generate API Key' }).click();

		await expect(apiKeyField(page)).toHaveValue('ovmeet-fake-key-1');
		await expect(apiKeyField(page)).toHaveAttribute('type', 'text');
		await expect(generatedOn(page)).toHaveText(/Generated on [A-Z][a-z]{2} \d{1,2}, \d{4}/);
		await expect(page.getByRole('button', { name: 'Regenerate Key' })).toBeVisible();
		await expect(page.locator('#revoke-key-btn')).toBeVisible();
		expect(requests).toContain('POST');
	});

	test('an existing key is masked until revealed and can be copied', async ({ page }) => {
		await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
		await fakeApiKey(page, { key: 'ovmeet-existing-key', creationDate: Date.UTC(2026, 2, 15, 12) });
		await fakeWebhooks(page, []);
		await gotoEmbedded(page);

		await expect(apiKeyField(page)).toHaveAttribute('type', 'password');
		await expect(generatedOn(page)).toHaveText(/Generated on Mar (14|15|16), 2026/);

		await page.locator('.toggle-visibility-button').click();
		await expect(apiKeyField(page)).toHaveAttribute('type', 'text');

		await page.locator('.toggle-visibility-button').click();
		await expect(apiKeyField(page)).toHaveAttribute('type', 'password');

		await page.getByRole('button', { name: 'Copy' }).click();

		await expect(notification(page, 'API Key copied to clipboard')).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('ovmeet-existing-key');
	});

	test('regenerating replaces the key and revoking removes it', async ({ page }) => {
		const requests = await fakeApiKey(page, { key: 'ovmeet-existing-key', creationDate: Date.now() });
		await fakeWebhooks(page, []);
		await gotoEmbedded(page);

		await page.getByRole('button', { name: 'Regenerate Key' }).click();

		await expect(apiKeyField(page)).toHaveValue('ovmeet-fake-key-1');
		await expect(apiKeyField(page)).toHaveAttribute('type', 'text');

		await page.locator('#revoke-key-btn').click();

		await expect(page.getByRole('button', { name: 'Generate API Key' })).toBeVisible();
		await expect(apiKeyField(page)).toHaveCount(0);
		await expect(page.locator('#revoke-key-btn')).toHaveCount(0);
		expect(requests).toEqual(expect.arrayContaining(['POST', 'DELETE']));
	});
});

test.describe('Console Embedded page webhooks E2E Tests', () => {
	const apiKey = { key: 'ovmeet-existing-key', creationDate: Date.now() };

	test('lists the webhooks with all events and all rooms where nothing narrows them, and the active count', async ({
		page
	}) => {
		await fakeApiKey(page, apiKey);
		await fakeWebhooks(page, [
			makeWebhook('wh_open'),
			makeWebhook('wh_narrow', {
				enabled: false,
				events: [MeetWebhookEventType.RECORDING_ENDED],
				roomId: 'room-123'
			})
		]);

		await gotoEmbedded(page);

		const rows = page.locator('.webhook-item');
		await expect(rows).toHaveCount(2);
		await expect(rows.nth(0)).toContainText('https://hooks.example.com/wh_open');
		await expect(rows.nth(0).locator('.col-events')).toHaveText('All events');
		await expect(rows.nth(0).locator('.col-room')).toHaveText('All rooms');
		await expect(rows.nth(1).locator('.col-events')).toHaveText('recordingEnded');
		await expect(rows.nth(1).locator('.col-room')).toContainText('room-123');
		await expect(page.locator('.webhook-count')).toHaveText('1 of 2 active');
	});

	test('the editor keeps Save disabled while the narrowed filter has no event ticked', async ({ page }) => {
		await fakeApiKey(page, apiKey);
		await fakeWebhooks(page, []);
		await gotoEmbedded(page);
		await page.getByRole('button', { name: 'Add Webhook' }).click();
		const save = page.getByRole('button', { name: 'Save Webhook' });

		await page.getByLabel('Webhook URL').fill('https://hooks.example.com/new');
		await expect(save).toBeEnabled();

		await page.getByRole('radio', { name: 'Only selected' }).click();
		await expect(save).toBeDisabled();

		await page.getByRole('checkbox', { name: MeetWebhookEventType.MEETING_STARTED }).check();
		await expect(save).toBeEnabled();

		await page.getByRole('checkbox', { name: MeetWebhookEventType.MEETING_STARTED }).uncheck();
		await expect(save).toBeDisabled();
	});

	test('a save the server refuses keeps the dialog open with what was typed and shows the limit message', async ({
		page
	}) => {
		const limitMessage = 'The maximum number of registered webhooks (10) has been reached';
		await fakeApiKey(page, apiKey);
		await fakeWebhooks(page, []);
		await page.route(WEBHOOKS_URL, async (route) => {
			if (route.request().method() !== 'POST') return route.fallback();

			await route.fulfill({ status: 409, json: { error: 'Webhook Error', message: limitMessage } });
		});
		await gotoEmbedded(page);
		await page.getByRole('button', { name: 'Add Webhook' }).click();
		await page.getByLabel('Webhook URL').fill('https://hooks.example.com/eleventh');
		await page.getByRole('radio', { name: 'One room' }).click();
		await page.getByLabel('Room ID').fill('room-eleventh');

		await page.getByRole('button', { name: 'Save Webhook' }).click();

		await expect(notification(page, limitMessage)).toBeVisible();
		await expect(page.locator('ov-webhook-editor-dialog')).toBeVisible();
		await expect(page.getByLabel('Webhook URL')).toHaveValue('https://hooks.example.com/eleventh');
		await expect(page.getByLabel('Room ID')).toHaveValue('room-eleventh');
	});

	test('pausing from the list updates the webhook with enabled false and the rest unchanged', async ({ page }) => {
		const webhook = makeWebhook('wh_pause', {
			events: [MeetWebhookEventType.RECORDING_ENDED, MeetWebhookEventType.MEETING_ENDED],
			roomId: 'room-123'
		});
		await fakeApiKey(page, apiKey);
		const updates = await fakeWebhooks(page, [webhook]);
		await gotoEmbedded(page);

		await page.locator('.webhook-item mat-slide-toggle').click();

		await expect(page.locator('.webhook-count')).toHaveText('0 of 1 active');
		expect(updates).toEqual([{ url: webhook.url, events: webhook.events, roomId: 'room-123', enabled: false }]);
	});

	test('without an API key the section warns and adding a webhook is disabled', async ({ page }) => {
		await fakeApiKey(page);
		await fakeWebhooks(page, []);

		await gotoEmbedded(page);

		await expect(page.locator('.webhook-warning')).toContainText('No API key yet');
		await expect(page.getByRole('button', { name: 'Add Webhook' })).toBeDisabled();
	});

	test('a failed test shows that it failed and the reason the server gave', async ({ page }) => {
		await fakeApiKey(page, apiKey);
		await fakeWebhooks(page, [makeWebhook('wh_refused')]);
		await page.route(WEBHOOK_TEST_URL, (route) =>
			route.fulfill({
				status: 502,
				json: { error: 'Webhook Error', message: 'connect ECONNREFUSED 127.0.0.1:9' }
			})
		);
		await gotoEmbedded(page);

		await page.getByRole('button', { name: 'Test', exact: true }).click();

		await expect(notification(page, 'Failed to send test webhook. connect ECONNREFUSED 127.0.0.1:9')).toBeVisible();
	});
});
