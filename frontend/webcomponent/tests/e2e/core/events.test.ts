import { expect, test } from '@playwright/test';
import { MEET_TESTAPP_URL } from '../../config';
import {
	createTestRoom,
	deleteAllRecordings,
	deleteAllRooms,
	joinRoomAs,
	leaveRoom,
	prepareForJoiningRoom
} from '../../helpers/function-helpers';

let subscribedToAppErrors = false;

test.describe('Web Component E2E Tests', () => {
	let roomId: string;
	let participantName: string;

	test.beforeAll(async () => {
		// Create a test room before all tests
		roomId = await createTestRoom('test-room');
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

		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
		participantName = `P-${Math.random().toString(36).substring(2, 9)}`;
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
		test('should successfully join as moderator and receive joined event', async ({ page }) => {
			await joinRoomAs('moderator', participantName, page);
			await page.waitForSelector('.event-joined');
			const joinElements = await page.locator('.event-joined').all();
			expect(joinElements.length).toBe(1);
		});

		test('should successfully join as speaker and receive joined event', async ({ page }) => {
			await joinRoomAs('speaker', participantName, page);
			await page.waitForSelector('.event-joined');
			const joinElements = await page.locator('.event-joined').all();
			expect(joinElements.length).toBe(1);
		});

		test('should successfully join to room and receive left event when using leave command', async ({ page }) => {
			await joinRoomAs('moderator', participantName, page);

			await page.click('#leave-room-btn');
			await page.waitForSelector('.event-left');
			const leftElements = await page.locator('.event-left').all();
			expect(leftElements.length).toBe(1);
		});

		test('should successfully join to room and receive left event when using disconnect button', async ({
			page
		}) => {
			await joinRoomAs('moderator', participantName, page);

			await leaveRoom(page, 'moderator');
			await page.waitForSelector('.event-left');
			const leftElements = await page.locator('.event-left').all();
			expect(leftElements.length).toBe(1);
		});

		test('should successfully join to room and receive left event when using end meeting command', async ({
			page
		}) => {
			await joinRoomAs('moderator', participantName, page);

			await page.click('#end-meeting-btn');
			await page.waitForSelector('.event-left');
			const meetingEndedElements = await page.locator('.event-left').all();
			expect(meetingEndedElements.length).toBe(1);
		});
	});
});
