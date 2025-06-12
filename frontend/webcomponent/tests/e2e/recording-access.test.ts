import { test, expect } from '@playwright/test';
import {
	closeMoreOptionsMenu,
	createTestRoom,
	deleteAllRecordings,
	deleteAllRooms,
	deleteTestRoom,
	interactWithElementInIframe,
	joinRoomAs,
	leaveRoom,
	loginAsAdmin,
	openMoreOptionsMenu,
	prepareForJoiningRoom,
	startStopRecording,
	updateRoomPreferences,
	viewRecordingsAs,
	waitForElementInIframe
} from '../helpers/function-helpers';
import { MeetRecordingAccess } from '../../../../typings/src/room-preferences';

let subscribedToAppErrors = false;
let recordingCreated = false;

test.describe('Recording Access Tests', () => {
	const testAppUrl = 'http://localhost:5080';
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

	test.beforeEach(async ({ page }) => {
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
			await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
			await joinRoomAs('moderator', participantName, page);

			await startStopRecording(page, 'start');

			await page.waitForTimeout(2000);

			await startStopRecording(page, 'stop');
			recordingCreated = true;
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

		await page.goto(testAppUrl);
		await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
		await viewRecordingsAs('moderator', page);

		await waitForElementInIframe(page, 'ov-error', { state: 'visible' });
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

		await page.goto(testAppUrl);
		await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
		await viewRecordingsAs('publisher', page);

		await waitForElementInIframe(page, 'ov-error', { state: 'visible' });
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

		await page.goto(testAppUrl);
		await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
		await viewRecordingsAs('moderator', page);

		await waitForElementInIframe(page, 'ov-error', { state: 'hidden' });
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

		await page.goto(testAppUrl);
		await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
		await viewRecordingsAs('publisher', page);
		await waitForElementInIframe(page, 'ov-error', { state: 'visible' });
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

		await page.goto(testAppUrl);
		await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
		await viewRecordingsAs('moderator', page);
		await waitForElementInIframe(page, 'ov-error', { state: 'hidden' });
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

		await page.goto(testAppUrl);
		await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
		await viewRecordingsAs('publisher', page);
		await waitForElementInIframe(page, 'ov-error', { state: 'hidden' });
		await waitForElementInIframe(page, 'app-room-recordings', { state: 'visible' });
	});

	test('should allow moderators to access recording when access level is set to public', async ({ page }) => {
		await updateRoomPreferences(
			roomId,
			{
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.PUBLIC
				},
				virtualBackgroundPreferences: { enabled: true }
			},
			adminCookie
		);

		await page.goto(testAppUrl);
		await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
		await viewRecordingsAs('moderator', page);
		await waitForElementInIframe(page, 'ov-error', { state: 'hidden' });
		await waitForElementInIframe(page, 'app-room-recordings', { state: 'visible' });
	});
	test('should allow publisher to access recording when access level is set to public', async ({ page }) => {
		await updateRoomPreferences(
			roomId,
			{
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.PUBLIC
				},
				virtualBackgroundPreferences: { enabled: true }
			},
			adminCookie
		);

		await page.goto(testAppUrl);
		await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
		await viewRecordingsAs('publisher', page);
		await waitForElementInIframe(page, 'ov-error', { state: 'hidden' });
		await waitForElementInIframe(page, 'app-room-recordings', { state: 'visible' });
	});
});
