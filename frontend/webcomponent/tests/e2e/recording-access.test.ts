import { test } from '@playwright/test';
import { MeetRecordingAccess } from '../../../../typings/src/room-preferences';
import { MEET_TESTAPP_URL } from '../config';
import {
	accessRoomAs,
	createTestRoom,
	deleteAllRecordings,
	deleteAllRooms,
	joinRoomAs,
	leaveRoom,
	loginAsAdmin,
	prepareForJoiningRoom,
	startStopRecording,
	updateRoomPreferences,
	viewRecordingsAs,
	waitForElementInIframe
} from '../helpers/function-helpers';

let subscribedToAppErrors = false;
let recordingCreated = false;

test.describe('Recording Access Tests', () => {
	const testRoomPrefix = 'recording-access-test';
	let participantName: string;
	let roomId: string;
	let adminCookie: string;

	test.beforeAll(async () => {
		adminCookie = await loginAsAdmin();
		// Ensure the test room is created before running tests
		roomId = await createTestRoom(testRoomPrefix, {
			chatPreferences: { enabled: true },
			recordingPreferences: {
				enabled: true,
				allowAccessTo: MeetRecordingAccess.ADMIN
			},
			virtualBackgroundPreferences: { enabled: true }
		});
	});

	test.beforeEach(async ({ browser, page }) => {
		if (!subscribedToAppErrors) {
			page.on('console', (msg) => {
				const type = msg.type();
				const tag = type === 'error' ? 'ERROR' : type === 'warning' ? 'WARNING' : 'LOG';
				console.log('[' + tag + ']', msg.text());
			});
			subscribedToAppErrors = true;
		}

		participantName = `P-${Math.random().toString(36).substring(2, 9)}`;

		if (!recordingCreated) {
			const tempContext = await browser.newContext();
			const tempPage = await tempContext.newPage();
			await prepareForJoiningRoom(tempPage, MEET_TESTAPP_URL, testRoomPrefix);
			await joinRoomAs('moderator', participantName, tempPage);

			await startStopRecording(tempPage, 'start');
			await tempPage.waitForTimeout(2000);
			await startStopRecording(tempPage, 'stop');
			recordingCreated = true;

			await leaveRoom(tempPage, 'moderator');
			await tempContext.close();
			await tempPage.close();
		}
	});

	test.afterAll(async ({ browser }) => {
		const tempContext = await browser.newContext();
		const tempPage = await tempContext.newPage();
		await deleteAllRooms(tempPage);
		await deleteAllRecordings(tempPage);

		await tempContext.close();
		await tempPage.close();
	});

	test('should moderator not be able to access recording when access level is set to admin', async ({ page }) => {
		await updateRoomPreferences(
			roomId,
			{
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN
				},
				virtualBackgroundPreferences: { enabled: true }
			},
			adminCookie
		);

		await page.goto(MEET_TESTAPP_URL);
		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, testRoomPrefix);
		await accessRoomAs('moderator', page);

		await waitForElementInIframe(page, '#view-recordings-btn', { state: 'hidden' });
	});

	test('should publisher not be able to access recording when access level is set to admin', async ({ page }) => {
		await updateRoomPreferences(
			roomId,
			{
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN
				},
				virtualBackgroundPreferences: { enabled: true }
			},
			adminCookie
		);

		await page.goto(MEET_TESTAPP_URL);
		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, testRoomPrefix);
		await accessRoomAs('publisher', page);

		await waitForElementInIframe(page, '#view-recordings-btn', { state: 'hidden' });
	});

	test('should allow moderator to access recording when access level is set to moderator', async ({ page }) => {
		await updateRoomPreferences(
			roomId,
			{
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR
				},
				virtualBackgroundPreferences: { enabled: true }
			},
			adminCookie
		);

		await page.goto(MEET_TESTAPP_URL);
		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, testRoomPrefix);
		await viewRecordingsAs('moderator', page);

		await waitForElementInIframe(page, 'app-room-recordings', { state: 'visible' });
	});

	test('should publisher not be able to access recording when access level is set to moderator', async ({ page }) => {
		await updateRoomPreferences(
			roomId,
			{
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR
				},
				virtualBackgroundPreferences: { enabled: true }
			},
			adminCookie
		);

		await page.goto(MEET_TESTAPP_URL);
		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, testRoomPrefix);
		await accessRoomAs('publisher', page);

		await waitForElementInIframe(page, '#view-recordings-btn', { state: 'hidden' });
	});

	test('should allow moderators to access recording when access level is set to publisher', async ({ page }) => {
		await updateRoomPreferences(
			roomId,
			{
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR
				},
				virtualBackgroundPreferences: { enabled: true }
			},
			adminCookie
		);

		await page.goto(MEET_TESTAPP_URL);
		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, testRoomPrefix);
		await viewRecordingsAs('moderator', page);

		await waitForElementInIframe(page, 'app-room-recordings', { state: 'visible' });
	});

	test('should allow publisher to access recording when access level is set to publisher', async ({ page }) => {
		await updateRoomPreferences(
			roomId,
			{
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
				},
				virtualBackgroundPreferences: { enabled: true }
			},
			adminCookie
		);

		await page.goto(MEET_TESTAPP_URL);
		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, testRoomPrefix);
		await viewRecordingsAs('publisher', page);

		await waitForElementInIframe(page, 'app-room-recordings', { state: 'visible' });
	});
});
