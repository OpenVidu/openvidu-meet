import { test, expect } from '@playwright/test';
import {
	deleteAllRecordings,
	deleteAllRooms,
	joinRoomAs,
	waitForElementInIframe
} from '../../helpers/function-helpers';

let subscribedToAppErrors = false;

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
		if (!subscribedToAppErrors) {
			page.on('console', (msg) => {
				const type = msg.type();
				const tag = type === 'error' ? 'ERROR' : type === 'warning' ? 'WARNING' : 'LOG';
				console.log('[' + tag + ']', msg.text());
			});
			subscribedToAppErrors = true;
		}
		await page.goto(testAppUrl);
		await page.waitForSelector('.rooms-container');
		await page.waitForSelector(`#${testRoomPrefix}`);
		await page.click('.dropdown-button');
		await page.waitForSelector('#join-as-moderator');
		await page.waitForSelector('#join-as-publisher');
	});

	test.afterEach(async ({ context }) => {
		await context.storageState({ path: 'test_localstorage_state.json' });
	});

	test.afterAll(async ({ browser }) => {
		const tempContext = await browser.newContext();
		const tempPage = await tempContext.newPage();
		await deleteAllRooms(tempPage);
		await deleteAllRecordings(tempPage);

		await tempContext.close();
		await tempPage.close();
	});

	test.describe('Event Handling', () => {
		test('should successfully join as moderator and receive JOIN event', async ({ page }) => {
			await joinRoomAs('moderator', `P-${Math.random().toString(36).substring(2, 9)}`, page);
			await page.waitForSelector('.event-JOIN');
			const joinElements = await page.locator('.event-JOIN').all();
			expect(joinElements.length).toBe(1);
		});

		test('should successfully join as publisher and receive JOIN event', async ({ page }) => {
			await joinRoomAs('publisher', `P-${Math.random().toString(36).substring(2, 9)}`, page);
			await page.waitForSelector('.event-JOIN');
			const joinElements = await page.locator('.event-JOIN').all();
			expect(joinElements.length).toBe(1);
		});

		test('should successfully join to room and receive LEFT event when using leave command', async ({ page }) => {
			await joinRoomAs('moderator', `P-${Math.random().toString(36).substring(2, 9)}`, page);

			await page.click('#leave-room-btn');
			await page.waitForSelector('.event-LEFT');
			const leftElements = await page.locator('.event-LEFT').all();
			expect(leftElements.length).toBe(1);
		});

		test('should successfully join to room and receive LEFT event when using disconnect button', async ({
			page
		}) => {
			await joinRoomAs('moderator', `P-${Math.random().toString(36).substring(2, 9)}`, page);

			const button = await waitForElementInIframe(page, '#leave-btn');
			await button.click();
			await page.waitForSelector('.event-LEFT');
			const leftElements = await page.locator('.event-LEFT').all();
			expect(leftElements.length).toBe(1);
		});

		test('should successfully join to room and receive MEETING_ENDED event when using end meeting command', async ({
			page
		}) => {
			await joinRoomAs('moderator', `P-${Math.random().toString(36).substring(2, 9)}`, page);

			await page.click('#end-meeting-btn');
			await page.waitForSelector('.event-MEETING_ENDED');
			const meetingEndedElements = await page.locator('.event-MEETING_ENDED').all();
			expect(meetingEndedElements.length).toBe(1);

			// Check LEFT event does not exist
			const leftEventElements = await page.locator('.event-LEFT').all();
			expect(leftEventElements.length).toBe(0);
		});
	});
});
