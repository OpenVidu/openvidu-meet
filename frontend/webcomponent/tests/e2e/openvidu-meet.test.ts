import { test, expect } from '@playwright/test';
import { waitForElementInIframe } from '../helpers/function-helpers';
import fs from 'fs';
import defaultConfig from '../../playwright.config';

test.describe('Web Component E2E Tests', () => {
	const testAppUrl = 'http://localhost:5080';
	const testRoomPrefix = 'test-room';

	test.beforeAll(async ({ browser }) => {
		// Create a test room before all tests
		const tempContext = await browser.newContext();
		const tempPage = await tempContext.newPage();
		await tempPage.goto(testAppUrl);
		await tempPage.waitForSelector('.create-room');
		await tempPage.fill('#room-id-prefix', testRoomPrefix);
		await tempPage.click('.create-room-btn');
		await tempPage.waitForSelector(`#${testRoomPrefix}`);
		await tempPage.close();
		await tempContext.close();
	});

	test.beforeEach(async ({ page }) => {
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				console.error(`Console Error: ${msg.text()}`);
			}
		});
		await page.goto(testAppUrl);
		await page.waitForSelector('.rooms-container');
		await page.waitForSelector(`#${testRoomPrefix}`);
		await page.click('.dropdown-button');
		await page.waitForSelector('#join-as-moderator');
		await page.waitForSelector('#join-as-publisher');
	});

	test.afterEach(async ({ page, context }, testInfo) => {
		if (testInfo.status !== testInfo.expectedStatus) {
			console.error(`FAIL: ${testInfo.title}`);

			// Take screenshot if the test fails
			if (page && !page.isClosed()) {
				try {
					const screenshotBuffer = await page.screenshot({
						fullPage: true,
						type: 'png'
					});

					const screenshotBase64 = screenshotBuffer.toString('base64');

					console.log('Screenshot en base64:');
					console.log(`data:image/png;base64,${screenshotBase64}`);
				} catch (error) {
					console.error('Error taking screenshot:', error);
				}
			}
		}
		await context.storageState({ path: 'test_localstorage_state.json' });
	});

	test.describe('Component Rendering', () => {
		test('should load the web component with proper iframe', async ({ page }) => {
			await page.click('#join-as-moderator');
			const component = page.locator('openvidu-meet');
			await expect(component).toBeVisible();

			const hasIframe = await page.evaluate(() => {
				const component = document.querySelector('openvidu-meet');
				return !!component?.shadowRoot?.querySelector('iframe');
			});
			expect(hasIframe).toBeTruthy();
		});
	});

	test.describe('Event Handling', () => {
		test('should successfully join as moderator and receive JOIN event', async ({ page }) => {
			await page.click('#join-as-moderator');
			await waitForElementInIframe(page, 'ov-session');
			await page.waitForSelector('.event-JOIN');
			const joinElements = await page.locator('.event-JOIN').all();
			expect(joinElements.length).toBe(1);
		});

		test('should successfully join as publisher and receive JOIN event', async ({ page }) => {
			await page.click('#join-as-publisher');
			await waitForElementInIframe(page, 'ov-session');
			await page.waitForSelector('.event-JOIN');
			const joinElements = await page.locator('.event-JOIN').all();
			expect(joinElements.length).toBe(1);
		});

		test('should successfully join to room and receive LEFT event when using leave command', async ({ page }) => {
			await page.click('#join-as-moderator');
			await waitForElementInIframe(page, 'ov-session');
			await page.click('#leave-room-btn');
			await page.waitForSelector('.event-LEFT');
			const leftElements = await page.locator('.event-LEFT').all();
			expect(leftElements.length).toBe(1);
		});

		test('should successfully join to room and receive LEFT event when using disconnect button', async ({ page }) => {
			await page.click('#join-as-moderator');
			await waitForElementInIframe(page, 'ov-session');
			const button = await waitForElementInIframe(page, '#leave-btn');
			await button.click();
			await page.waitForSelector('.event-LEFT');
			const leftElements = await page.locator('.event-LEFT').all();
			expect(leftElements.length).toBe(1);
		});

		test('should successfully join to room and receive MEETING_ENDED event when using end meeting command', async ({ page }) => {
			await page.click('#join-as-moderator');
			await waitForElementInIframe(page, 'ov-session');
			await page.click('#end-meeting-btn');
			await page.waitForSelector('.event-MEETING_ENDED');
			const meetingEndedElements = await page.locator('.event-MEETING_ENDED').all();
			expect(meetingEndedElements.length).toBe(1);

			// Check LEFT event does not exist
			const leftEventElements = await page.locator('.event-LEFT').all();
			expect(leftEventElements.length).toBe(0);
		});
	});

	test.describe('Webhook Handling', () => {
		test('should successfully receive meetingStarted and meetingEnded webhooks', async ({ page }) => {
			await page.click('#join-as-moderator');

			await page.waitForTimeout(1000); // Wait for 1 second to ensure the meeting has started
			await page.screenshot({ path: 'screenshot.png' });
			await waitForElementInIframe(page, 'ov-session');
			await page.waitForSelector('.webhook-meetingStarted');
			const meetingStartedElements = await page.locator('.webhook-meetingStarted').all();
			expect(meetingStartedElements.length).toBe(1);

			// End the meeting
			await page.click('#end-meeting-btn');
			await page.waitForSelector('.webhook-meetingEnded');
			const meetingEndedElements = await page.locator('.webhook-meetingEnded').all();
			expect(meetingEndedElements.length).toBe(1);
		});
	});
});
