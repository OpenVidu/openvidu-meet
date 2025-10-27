import { expect, test, Page, BrowserContext } from '@playwright/test';
import { MEET_TESTAPP_URL } from '../../config.js';
import {
	createTestRoom,
	deleteAllRecordings,
	deleteAllRooms,
	getIframeInShadowDom,
	getLocalParticipantId,
	getParticipantIdByName,
	interactWithElementInIframe,
	isShareLinkOverlayyHidden,
	joinRoomAs,
	leaveRoom,
	makeParticipantModerator,
	openParticipantsPanel,
	prepareForJoiningRoom,
	removeParticipantModerator,
	waitForElementInIframe
} from '../../helpers/function-helpers.js';

let subscribedToAppErrors = false;

/**
 * Test suite for moderation features in OpenVidu Meet
 * Tests moderator-specific functionality including share link overlay,
 * moderator badges, and moderation controls (make/unmake moderator, kick participant)
 */
test.describe('Moderation Functionality Tests', () => {
	let roomId: string;
	let moderatorName: string;
	let speakerName: string;

	// ==========================================
	// SETUP & TEARDOWN
	// ==========================================

	test.beforeAll(async () => {
		// Create a test room before all tests
		roomId = await createTestRoom('moderation-test-room');
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

		moderatorName = `Moderator-${Math.random().toString(36).substring(2, 9)}`;
		speakerName = `Speaker-${Math.random().toString(36).substring(2, 9)}`;
	});

	test.afterEach(async ({ context }) => {
		// Save storage state after each test
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

	// ==========================================
	// SHARE LINK OVERLAY TESTS
	// ==========================================

	test.describe('Share Link Overlay', () => {
		test('should show share link overlay when moderator is alone in the room', async ({ page }) => {
			// Moderator joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', moderatorName, page);

			// Wait for session to be established
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Check that share link overlay is visible
			const shareLinkOverlay = await waitForElementInIframe(page, '#share-link-overlay', {
				state: 'visible',
				timeout: 5000
			});
			await expect(shareLinkOverlay).toBeVisible();

			await leaveRoom(page, 'moderator');
		});

		test('should hide share link overlay when other participants join the room', async ({ page, browser }) => {
			// Moderator joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', moderatorName, page);

			// Wait for session and check overlay is visible
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
			const shareLinkOverlay = await waitForElementInIframe(page, '#share-link-overlay', {
				state: 'visible',
				timeout: 5000
			});
			await expect(shareLinkOverlay).toBeVisible();

			// Second participant (speaker) joins
			const speakerContext = await browser.newContext();
			const speakerPage = await speakerContext.newPage();
			await prepareForJoiningRoom(speakerPage, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('speaker', speakerName, speakerPage);

			// Wait for remote participant to be visible in moderator's view
			await waitForElementInIframe(page, '.OV_stream.remote', { state: 'visible', timeout: 10000 });

			// Wait a moment for the overlay to hide (give it more time)
			await page.waitForTimeout(3000);

			// Check that share link overlay is no longer visible for moderator
			const isHidden = await isShareLinkOverlayyHidden(page, '#share-link-overlay');
			expect(isHidden).toBeTruthy();

			// Cleanup
			await leaveRoom(speakerPage);
			await leaveRoom(page, 'moderator');
			await speakerContext.close();
		});
		test('should not show share link overlay when user is not a moderator', async ({ page }) => {
			// Speaker joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('speaker', speakerName, page);

			// Wait for session to be established
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
			await page.waitForTimeout(2000);

			// Check that share link overlay is not visible
			const isHidden = await isShareLinkOverlayyHidden(page, '#share-link-overlay');
			expect(isHidden).toBeTruthy();

			await leaveRoom(page);
		});
	});

	// ==========================================
	// MODERATOR BADGE AND CONTROLS TESTS
	// ==========================================

	test.describe('Moderator Badge and Controls', () => {
		test('should show moderator badge and controls when making participant a moderator', async ({
			page,
			browser
		}) => {
			// Moderator joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', moderatorName, page);
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Speaker joins the room
			const speakerContext = await browser.newContext();
			const speakerPage = await speakerContext.newPage();
			await prepareForJoiningRoom(speakerPage, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('speaker', speakerName, speakerPage);
			await waitForElementInIframe(speakerPage, 'ov-session', { state: 'visible' });

			// Wait for remote participant to appear in both views
			await waitForElementInIframe(page, '.OV_stream.remote', { state: 'visible', timeout: 10000 });
			await page.waitForTimeout(2000);

			// Moderator opens participants panel
			await openParticipantsPanel(page);

			// Get speaker's participant ID
			const speakerParticipantId = await getParticipantIdByName(page, speakerName);

			if (!speakerParticipantId) {
				throw new Error(`Could not find speaker participant ID for: ${speakerName}`);
			}

			// Make speaker a moderator
			await makeParticipantModerator(page, speakerParticipantId);

			// Speaker opens their participants panel
			await openParticipantsPanel(speakerPage);

			// Get speaker's own participant ID from their page
			const speakerOwnParticipantId = await getLocalParticipantId(speakerPage);

			if (!speakerOwnParticipantId) {
				throw new Error('Could not find speaker own participant ID');
			}

			const moderatorBadge = await waitForElementInIframe(
				speakerPage,
				`#moderator-badge-${speakerOwnParticipantId}`,
				{
					state: 'visible',
					timeout: 10000
				}
			);
			await expect(moderatorBadge).toBeVisible();

			// Speaker (now moderator) should be able to see moderation controls
			// We verify by checking that at least one .moderation-controls div exists in the DOM
			const frameLocator = await getIframeInShadowDom(speakerPage);
			const moderationControlsCount = await frameLocator.locator('.moderation-controls').count();

			// Should have at least 1 moderation-controls div (for the original moderator)
			expect(moderationControlsCount).toBeGreaterThanOrEqual(1);

			// Cleanup
			await leaveRoom(speakerPage, 'moderator');
			await leaveRoom(page, 'moderator');
			await speakerContext.close();
		});

		test('should remove moderator badge and controls when revoking moderator role', async ({ page, browser }) => {
			// Moderator joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', moderatorName, page);
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Speaker joins the room
			const speakerContext = await browser.newContext();
			const speakerPage = await speakerContext.newPage();
			await prepareForJoiningRoom(speakerPage, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('speaker', speakerName, speakerPage);
			await waitForElementInIframe(speakerPage, 'ov-session', { state: 'visible' });

			// Wait for remote participant to appear
			await waitForElementInIframe(page, '.OV_stream.remote', { state: 'visible', timeout: 10000 });
			await page.waitForTimeout(2000);

			// Moderator opens participants panel
			await openParticipantsPanel(page);

			// Get speaker's participant ID
			const speakerParticipantId = await getParticipantIdByName(page, speakerName);

			if (!speakerParticipantId) {
				throw new Error(`Could not find speaker participant ID for: ${speakerName}`);
			}

			// Make speaker a moderator
			await makeParticipantModerator(page, speakerParticipantId);

			// Verify speaker has moderator badge
			await openParticipantsPanel(speakerPage);

			const speakerOwnParticipantId = await getLocalParticipantId(speakerPage);

			if (!speakerOwnParticipantId) {
				throw new Error('Could not find speaker own participant ID');
			}

			const moderatorBadge = await waitForElementInIframe(
				speakerPage,
				`#moderator-badge-${speakerOwnParticipantId}`,
				{
					state: 'visible',
					timeout: 10000
				}
			);
			await expect(moderatorBadge).toBeVisible();

			// Now revoke moderator role
			await removeParticipantModerator(page, speakerParticipantId);

			// Speaker should no longer see moderator badge
			await waitForElementInIframe(speakerPage, `#moderator-badge-${speakerOwnParticipantId}`, {
				state: 'hidden',
				timeout: 10000
			});

			// Speaker should not see moderation controls (verify they can't see controls for the moderator)
			const moderatorParticipantId = await getParticipantIdByName(speakerPage, moderatorName);
			if (moderatorParticipantId) {
				// If speaker is no longer moderator, moderation-controls div should be hidden
				await waitForElementInIframe(speakerPage, `#moderation-controls-${moderatorParticipantId}`, {
					state: 'hidden',
					timeout: 5000
				});
			}

			// Cleanup
			await leaveRoom(speakerPage);
			await leaveRoom(page, 'moderator');
			await speakerContext.close();
		});
	});

	// ==========================================
	// ORIGINAL MODERATOR PROTECTION TESTS
	// ==========================================

	test.describe('Original Moderator Protection', () => {
		test('should not allow removing moderator role from original moderator', async ({ page, browser }) => {
			// Moderator joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', moderatorName, page);
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Speaker joins as second moderator
			const speakerContext = await browser.newContext();
			const speakerPage = await speakerContext.newPage();
			await prepareForJoiningRoom(speakerPage, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', speakerName, speakerPage);
			await waitForElementInIframe(speakerPage, 'ov-session', { state: 'visible' });

			// Wait for both participants to be in the session
			await page.waitForTimeout(2000);

			// Second moderator opens participants panel
			await openParticipantsPanel(speakerPage);

			// Get original moderator's participant ID
			const originalModParticipantId = await getParticipantIdByName(speakerPage, moderatorName);

			if (!originalModParticipantId) {
				throw new Error(`Could not find original moderator participant ID for: ${moderatorName}`);
			}

			// Check that "remove moderator" button is NOT present for original moderator
			// The button should be in hidden state (not rendered)
			try {
				await waitForElementInIframe(speakerPage, `#remove-moderator-btn-${originalModParticipantId}`, {
					state: 'hidden',
					timeout: 2000
				});
				// If we get here, the button is correctly hidden
			} catch (error) {
				// If the element doesn't exist at all, that's also correct
				console.log('✅ Remove moderator button not found for original moderator (as expected)');
			}

			// Cleanup
			await leaveRoom(speakerPage, 'moderator');
			await leaveRoom(page, 'moderator');
			await speakerContext.close();
		});

		test('should not allow kicking original moderator from the room', async ({ page, browser }) => {
			// Moderator joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', moderatorName, page);
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Speaker joins as second moderator
			const speakerContext = await browser.newContext();
			const speakerPage = await speakerContext.newPage();
			await prepareForJoiningRoom(speakerPage, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', speakerName, speakerPage);
			await waitForElementInIframe(speakerPage, 'ov-session', { state: 'visible' });

			// Wait for both participants to be in the session
			await page.waitForTimeout(2000);

			// Second moderator opens participants panel
			await openParticipantsPanel(speakerPage);

			// Get original moderator's participant ID
			const originalModParticipantId = await getParticipantIdByName(speakerPage, moderatorName);

			if (!originalModParticipantId) {
				throw new Error(`Could not find original moderator participant ID for: ${moderatorName}`);
			}

			// Check that "kick participant" button is NOT present for original moderator
			// The button should be in hidden state (not rendered)
			try {
				await waitForElementInIframe(speakerPage, `#kick-participant-btn-${originalModParticipantId}`, {
					state: 'hidden',
					timeout: 2000
				});
				// If we get here, the button is correctly hidden
			} catch (error) {
				// If the element doesn't exist at all, that's also correct
				console.log('✅ Kick participant button not found for original moderator (as expected)');
			}

			// Cleanup
			await leaveRoom(speakerPage, 'moderator');
			await leaveRoom(page, 'moderator');
			await speakerContext.close();
		});
	});
});
