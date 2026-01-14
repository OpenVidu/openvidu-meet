import { MeetRoomStatus } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { MEET_TESTAPP_URL } from '../../config.js';
import {
	createTestRoom,
	deleteAllRecordings,
	deleteAllRooms,
	getRecordingFromAPI,
	getRoomFromAPI,
	getRoomFromWebhookStorage,
	joinRoomAs,
	prepareForJoiningRoom,
	startStopRecording
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

	test.describe('Webhook Handling', () => {
		test('should successfully receive meetingStarted and meetingEnded webhooks', async ({ page }) => {
			await joinRoomAs('moderator', participantName, page);

			await page.waitForSelector('.webhook-meetingStarted');
			const meetingStartedElements = await page.locator('.webhook-meetingStarted').all();
			expect(meetingStartedElements.length).toBe(1);

			// Get the actual room object from localStorage and compare deeply
			let [meetingStartedWebhook, actualRoom] = await Promise.all([
				getRoomFromWebhookStorage(page, roomId, 'meetingStarted'),
				getRoomFromAPI(roomId)
			]);

			expect(meetingStartedWebhook.data).toMatchObject(actualRoom);

			// End the meeting
			await page.click('#end-meeting-btn');
			await page.waitForSelector('.webhook-meetingEnded');
			const meetingEndedElements = await page.locator('.webhook-meetingEnded').all();
			expect(meetingEndedElements.length).toBe(1);

			// Verify meetingEnded webhook also matches room object
			const meetingEndedWebhook = await getRoomFromWebhookStorage(page, roomId, 'meetingEnded');
			// Update actualRoom status to OPEN for comparison
			actualRoom.status = MeetRoomStatus.OPEN;
			expect(meetingEndedWebhook.data).toMatchObject(actualRoom);
		});

		test('should successfully receive recordingStarted, recordingUpdated and recordingEnded webhooks', async ({
			page
		}) => {
			await joinRoomAs('moderator', participantName, page);

			// Start recording
			await startStopRecording(page, 'start');
			await page.waitForSelector('.webhook-recordingStarted');
			const recordingStartedElements = await page.locator('.webhook-recordingStarted').all();
			expect(recordingStartedElements.length).toBe(1);

			// Verify recordingStarted webhook payload
			const recordingStartedWebhook = await getRoomFromWebhookStorage(page, roomId, 'recordingStarted');
			expect(recordingStartedWebhook.event).toBe('recordingStarted');
			expect(recordingStartedWebhook.data).toBeDefined();
			expect(recordingStartedWebhook.data.recordingId).toBeDefined();

			const recordingId = recordingStartedWebhook.data.recordingId;

			// Get the actual recording object from API and compare
			const actualRecording = await getRecordingFromAPI(recordingId);
			expect(recordingStartedWebhook.data).toMatchObject({
				...actualRecording,
				startDate: expect.any(Number),
				status:  expect.stringMatching(/active|starting/)
			});

			// Update recording
			await page.waitForTimeout(2000); // Wait for a bit before updating
			await page.waitForSelector('.webhook-recordingUpdated');
			const recordingUpdatedElements = await page.locator('.webhook-recordingUpdated').all();
			expect(recordingUpdatedElements.length).toBe(1);

			// Verify recordingUpdated webhook payload
			const recordingUpdatedWebhook = await getRoomFromWebhookStorage(page, roomId, 'recordingUpdated');
			expect(recordingUpdatedWebhook.event).toBe('recordingUpdated');
			expect(recordingUpdatedWebhook.data).toBeDefined();
			expect(recordingUpdatedWebhook.data.recordingId).toBe(recordingId);

			// Get updated recording from API and compare
			const updatedRecording = await getRecordingFromAPI(recordingId);
			expect(recordingUpdatedWebhook.data).toMatchObject(updatedRecording);

			// End recording
			await startStopRecording(page, 'stop');
			await page.waitForSelector('.webhook-recordingEnded');
			const recordingEndedElements = await page.locator('.webhook-recordingEnded').all();
			expect(recordingEndedElements.length).toBe(1);

			// Verify recordingEnded webhook payload
			const recordingEndedWebhook = await getRoomFromWebhookStorage(page, roomId, 'recordingEnded');
			expect(recordingEndedWebhook.event).toBe('recordingEnded');
			expect(recordingEndedWebhook.data).toBeDefined();
			expect(recordingEndedWebhook.data.recordingId).toBe(recordingId);

			// Get final recording state from API and compare
			const endedRecording = await getRecordingFromAPI(recordingId);
			expect(recordingEndedWebhook.data).toMatchObject(endedRecording);
		});
	});
});
