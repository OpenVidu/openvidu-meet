import { expect, test } from '@playwright/test';
import { MeetRecordingAccess } from '../../../../typings/src/room-preferences';
import { MEET_TESTAPP_URL } from '../config';
import {
	applyVirtualBackground,
	closeMoreOptionsMenu,
	createTestRoom,
	deleteAllRecordings,
	deleteAllRooms,
	interactWithElementInIframe,
	isVirtualBackgroundApplied,
	joinRoomAs,
	leaveRoom,
	loginAsAdmin,
	openMoreOptionsMenu,
	prepareForJoiningRoom,
	updateRoomPreferences,
	waitForElementInIframe,
	waitForVirtualBackgroundToApply
} from '../helpers/function-helpers';

let subscribedToAppErrors = false;

test.describe('UI Feature Preferences Tests', () => {
	let roomId: string;
	let participantName: string;
	let adminCookie: string;

	// ==========================================
	// SETUP & TEARDOWN
	// ==========================================

	test.beforeAll(async () => {
		// Login as admin to get authentication cookie
		adminCookie = await loginAsAdmin();

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

		participantName = `P-${Math.random().toString(36).substring(2, 9)}`;
	});

	test.afterAll(async ({ browser }) => {
		const tempContext = await browser.newContext();
		const tempPage = await tempContext.newPage();
		await deleteAllRooms(tempPage);
		await deleteAllRecordings(tempPage);

		await tempContext.close();
		await tempPage.close();
	});

	// ==========================================
	// CHAT FEATURE TESTS
	// ==========================================

	test.describe('Chat Feature', () => {
		test.afterEach(async ({ page }) => {
			try {
				await leaveRoom(page);
			} catch (error) {}
		});

		test('should show chat button when chat is enabled', async ({ page }) => {
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
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('publisher', participantName, page);

			// Check that chat button is visible
			const chatButton = await waitForElementInIframe(page, '#chat-panel-btn', { state: 'visible' });
			await expect(chatButton).toBeVisible();
		});

		test('should hide chat button when chat is disabled', async ({ page }) => {
			// Disable chat via API
			await updateRoomPreferences(
				roomId,
				{
					chatPreferences: { enabled: false },
					recordingPreferences: {
						enabled: true,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
					},
					virtualBackgroundPreferences: { enabled: true }
				},
				adminCookie
			);

			await page.goto(MEET_TESTAPP_URL);
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('publisher', participantName, page);

			// Check that chat button is not visible
			const chatButton = await waitForElementInIframe(page, '#chat-panel-btn', { state: 'hidden' });
			await expect(chatButton).toBeHidden();
		});
	});

	// ==========================================
	// RECORDING FEATURE TESTS
	// ==========================================

	test.describe('Recording Feature', () => {
		test('should show recording button for moderators', async ({ page }) => {
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
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			await openMoreOptionsMenu(page);

			// Check that recording button is visible for moderator
			await waitForElementInIframe(page, '#recording-btn', { state: 'visible' });

			await closeMoreOptionsMenu(page);
			await waitForElementInIframe(page, '#activities-panel-btn', {
				state: 'visible'
			});

			await interactWithElementInIframe(page, '#activities-panel-btn', { action: 'click' });
			await page.waitForTimeout(500);
			await waitForElementInIframe(page, 'ov-recording-activity', { state: 'visible' });
			await leaveRoom(page, 'moderator');
		});

		test('should not show recording button for publisher', async ({ page }) => {
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
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('publisher', participantName, page);

			// Check that recording button is not visible for publisher
			const recordingButton = await waitForElementInIframe(page, '#recording-btn', { state: 'hidden' });
			await expect(recordingButton).toBeHidden();
			await leaveRoom(page);
		});

		test('should not show recording button for moderators when recording is disabled', async ({ page }) => {
			// Disable recording via API
			await updateRoomPreferences(
				roomId,
				{
					chatPreferences: { enabled: true },
					recordingPreferences: {
						enabled: false,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
					},
					virtualBackgroundPreferences: { enabled: true }
				},
				adminCookie
			);

			await page.goto(MEET_TESTAPP_URL);
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Check that recording button is not visible
			await interactWithElementInIframe(page, '#more-options-btn', { action: 'click' });
			await page.waitForTimeout(500);
			await waitForElementInIframe(page, '#recording-btn', { state: 'hidden' });
			await closeMoreOptionsMenu(page);
			await waitForElementInIframe(page, '#activities-panel-btn', {
				state: 'hidden'
			});
			await leaveRoom(page, 'moderator');
		});
	});

	// ==========================================
	// VIRTUAL BACKGROUND FEATURE TESTS
	// ==========================================

	test.describe('Virtual Background Feature', () => {
		test.afterEach(async ({ page }) => {
			try {
				await leaveRoom(page);
			} catch (error) {}
		});
		test('should show virtual background button when enabled', async ({ page }) => {
			// Ensure virtual backgrounds are enabled
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
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('publisher', participantName, page);

			// Click more options to reveal virtual background button
			await openMoreOptionsMenu(page);

			// Check that virtual background button is visible
			await waitForElementInIframe(page, '#virtual-bg-btn', { state: 'visible' });
			await interactWithElementInIframe(page, '#virtual-bg-btn', { action: 'click' });

			await waitForElementInIframe(page, 'ov-background-effects-panel', { state: 'visible' });
		});

		test('should hide virtual background button when disabled', async ({ page }) => {
			// Disable virtual backgrounds via API
			await updateRoomPreferences(
				roomId,
				{
					chatPreferences: { enabled: true },
					recordingPreferences: {
						enabled: true,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
					},
					virtualBackgroundPreferences: { enabled: false }
				},
				adminCookie
			);

			await page.goto(MEET_TESTAPP_URL);
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('publisher', participantName, page);

			// Click more options to reveal virtual background button
			await openMoreOptionsMenu(page);

			// Check that virtual background button is visible
			await waitForElementInIframe(page, '#virtual-bg-btn', { state: 'hidden' });
			await closeMoreOptionsMenu(page);
		});

		test('should not apply virtual background when saved in local storage and feature is disabled', async ({
			page
		}) => {
			// Ensure virtual backgrounds are enabled
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
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('publisher', participantName, page);

			await applyVirtualBackground(page, '2');
			await waitForVirtualBackgroundToApply(page);

			// Now disable virtual backgrounds
			const { preferences: updatedPreferences } = await updateRoomPreferences(
				roomId,
				{
					chatPreferences: { enabled: true },
					recordingPreferences: {
						enabled: true,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
					},
					virtualBackgroundPreferences: { enabled: false }
				},
				adminCookie
			);

			expect(updatedPreferences.virtualBackgroundPreferences.enabled).toBe(false);
			await leaveRoom(page);
			await page.reload();

			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('publisher', participantName, page);
			await page.waitForTimeout(2000);

			const isVBApplied = await isVirtualBackgroundApplied(page);
			expect(isVBApplied).toBe(false);
		});
	});
});
