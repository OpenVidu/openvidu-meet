import { test, expect } from '@playwright/test';
import { deleteAllRecordings, deleteAllRooms, joinRoomAs, startStopRecording } from '../../helpers/function-helpers';

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

	test.describe('Webhook Handling', () => {
		test('should successfully receive meetingStarted and meetingEnded webhooks', async ({ page }) => {
			await joinRoomAs('moderator', `P-${Math.random().toString(36).substring(2, 9)}`, page);

			await page.waitForSelector('.webhook-meetingStarted');
			const meetingStartedElements = await page.locator('.webhook-meetingStarted').all();
			expect(meetingStartedElements.length).toBe(1);

			// End the meeting
			await page.click('#end-meeting-btn');
			await page.waitForSelector('.webhook-meetingEnded');
			const meetingEndedElements = await page.locator('.webhook-meetingEnded').all();
			expect(meetingEndedElements.length).toBe(1);
		});

		test('should successfully receive recordingStarted, recordingUpdated and recordingEnded  webhooks', async ({
			page
		}) => {
			await joinRoomAs('moderator', `P-${Math.random().toString(36).substring(2, 9)}`, page);

			// Start recording
			await startStopRecording(page, 'start');
			await page.waitForSelector('.webhook-recordingStarted');
			const recordingStartedElements = await page.locator('.webhook-recordingStarted').all();
			expect(recordingStartedElements.length).toBe(1);

			// Update recording
			await page.waitForTimeout(2000); // Wait for a bit before updating
			await page.waitForSelector('.webhook-recordingUpdated');
			const recordingUpdatedElements = await page.locator('.webhook-recordingUpdated').all();
			expect(recordingUpdatedElements.length).toBe(1);

			// End recording
			await startStopRecording(page, 'stop');
			await page.waitForSelector('.webhook-recordingEnded');
			const recordingEndedElements = await page.locator('.webhook-recordingEnded').all();
			expect(recordingEndedElements.length).toBe(1);
		});
	});
});
