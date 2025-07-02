import { test, expect } from '@playwright/test';
import {
	applyVirtualBackground,
	closeMoreOptionsMenu,
	createTestRoom,
	deleteAllRecordings,
	deleteAllRooms,
	deleteTestRoom,
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
import { MeetRecordingAccess } from '../../../../typings/src/room-preferences';

let subscribedToAppErrors = false;

test.describe('UI Feature Preferences Tests', () => {
	const testAppUrl = 'http://localhost:5080';
	const testRoomPrefix = 'ui-feature-testing-room';
	let participantName: string;
	let roomId: string;
	let adminCookie: string;

	// ==========================================
	// SETUP & TEARDOWN
	// ==========================================

	test.beforeAll(async () => {
		// Login as admin to get authentication cookie
		adminCookie = await loginAsAdmin();
		// Create test room
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
			roomId = await createTestRoom(testRoomPrefix, {
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
				},
				virtualBackgroundPreferences: { enabled: true }
			});

			await page.reload();
			await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);

			await joinRoomAs('publisher', participantName, page);

			// Check that chat button is visible
			const chatButton = await waitForElementInIframe(page, '#chat-panel-btn', { state: 'visible' });
			await expect(chatButton).toBeVisible();
		});

		test('should hide chat button when chat is disabled', async ({ page }) => {
			// Disable chat via API
			roomId = await createTestRoom(testRoomPrefix, {
				chatPreferences: { enabled: false },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
				},
				virtualBackgroundPreferences: { enabled: true }
			});

			await page.reload();
			await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
			await joinRoomAs('publisher', participantName, page);

			// Check that chat button is not visible
			const chatButton = page.frameLocator('openvidu-meet >>> iframe').locator('#chat-panel-btn');
			await expect(chatButton).toBeHidden();
		});
	});

	// ==========================================
	// RECORDING FEATURE TESTS
	// ==========================================

	test.describe('Recording Feature', () => {
		test('should show recording button for moderators', async ({ page }) => {
			roomId = await createTestRoom(testRoomPrefix, {
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
				},
				virtualBackgroundPreferences: { enabled: true }
			});

			await page.reload();
			await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);

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
			// Ensure recording is enabled but only for moderators
			roomId = await createTestRoom(testRoomPrefix, {
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR
				},
				virtualBackgroundPreferences: { enabled: true }
			});

			await page.reload();
			await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
			await joinRoomAs('publisher', participantName, page);

			// Check that recording button is not visible for publisher
			const recordingButton = page.frameLocator('openvidu-meet >>> iframe').locator('#recording-btn');
			await expect(recordingButton).toBeHidden();
			await leaveRoom(page);
		});

		test('should not show recording button for moderators when recording is disabled', async ({ page }) => {
			// Disable recording via API
			roomId = await createTestRoom(testRoomPrefix, {
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: false,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
				},
				virtualBackgroundPreferences: { enabled: true }
			});

			await page.reload();
			await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
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
			roomId = await createTestRoom(testRoomPrefix, {
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
				},
				virtualBackgroundPreferences: { enabled: true }
			});

			await page.reload();
			await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
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
			roomId = await createTestRoom(testRoomPrefix, {
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
				},
				virtualBackgroundPreferences: { enabled: false }
			});

			await page.reload();
			await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
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
			roomId = await createTestRoom(testRoomPrefix, {
				chatPreferences: { enabled: true },
				recordingPreferences: {
					enabled: true,
					allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
				},
				virtualBackgroundPreferences: { enabled: true }
			});

			await page.reload();
			await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
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

			await prepareForJoiningRoom(page, testAppUrl, testRoomPrefix);
			await joinRoomAs('publisher', participantName, page);
			await page.waitForTimeout(2000);
			const isVBApplied = await isVirtualBackgroundApplied(page);

			expect(isVBApplied).toBe(false);
		});
	});

	// ==========================================
	// ROLE-BASED FEATURE TESTS
	// ==========================================

	// test.describe('Role-based Feature Access', () => {
	// 	test('should show different features for moderator vs publisher', async ({ page, browser }) => {
	// 		// Setup recording to be available for moderators only
	// 		await updateRoomPreferences({
	// 			...getDefaultRoomPreferences(),
	// 			recordingPreferences: {
	// 				enabled: true,
	// 				allowAccessTo: 'admin-moderator'
	// 			}
	// 		});

	// 		// Test as moderator
	// 		await joinRoomAs('moderator', `moderator-${participantName}`, page);

	// 		// Moderator should see recording button
	// 		const moderatorRecordingButton = await waitForElementInIframe(page, '#recording-btn', { state: 'visible' });
	// 		await expect(moderatorRecordingButton).toBeVisible();

	// 		await leaveRoom(page);

	// 		// Test as publisher in a new context
	// 		const publisherContext = await browser.newContext();
	// 		const publisherPage = await publisherContext.newPage();
	// 		await prepareForJoiningRoom(publisherPage, testAppUrl, testRoomPrefix);

	// 		await joinRoomAs('publisher', `publisher-${participantName}`, publisherPage);

	// 		// Publisher should not see recording button
	// 		const publisherRecordingButton = publisherPage
	// 			.frameLocator('openvidu-meet >>> iframe')
	// 			.locator('#recording-btn');
	// 		await expect(publisherRecordingButton).toBeHidden();

	// 		await leaveRoom(publisherPage);
	// 		await publisherContext.close();
	// 	});
	// });
});
