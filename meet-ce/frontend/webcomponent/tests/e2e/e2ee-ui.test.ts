import { expect, test } from '@playwright/test';
import { MeetRecordingAccess } from '../../../../typings/src/room-config';
import { MEET_TESTAPP_URL } from '../config';
import {
	closeMoreOptionsMenu,
	countElementsInIframe,
	createTestRoom,
	deleteAllRecordings,
	deleteAllRooms,
	interactWithElementInIframe,
	joinRoomAs,
	leaveRoom,
	openMoreOptionsMenu,
	prepareForJoiningRoom,
	updateRoomConfig,
	waitForElementInIframe
} from '../helpers/function-helpers';

let subscribedToAppErrors = false;

test.describe('E2EE UI Tests', () => {
	let roomId: string;
	let participantName: string;

	// ==========================================
	// SETUP & TEARDOWN
	// ==========================================

	test.beforeAll(async () => {
		// Create a test room before all tests
		roomId = await createTestRoom('test-room-e2ee');
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
	// E2EE LOBBY UI TESTS
	// ==========================================

	test.describe('E2EE Lobby Elements', () => {
		test('should show E2EE key input and badge in lobby when E2EE is enabled', async ({ page }) => {
			// Enable E2EE
			await updateRoomConfig(roomId, {
				chat: { enabled: true },
				recording: { enabled: false, allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER },
				virtualBackground: { enabled: true },
				e2ee: { enabled: true }
			});

			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await page.click('#join-as-speaker');

			const component = page.locator('openvidu-meet');
			await expect(component).toBeVisible();

			// Wait for participant name input
			await waitForElementInIframe(page, '#participant-name-input', { state: 'visible' });

			// Check that E2EE badge is visible
			const e2eeBadge = await waitForElementInIframe(page, '.encryption-badge', { state: 'visible' });
			await expect(e2eeBadge).toBeVisible();
			await expect(e2eeBadge).toContainText('end-to-end encrypted');

			// Check that E2EE key input is visible
			const e2eeKeyInput = await waitForElementInIframe(page, '#participant-e2eekey-input', {
				state: 'visible'
			});
			await expect(e2eeKeyInput).toBeVisible();

			// Check that the input has correct attributes
			await expect(e2eeKeyInput).toHaveAttribute('type', 'password');
			await expect(e2eeKeyInput).toHaveAttribute('required');
		});

		test('should hide E2EE elements in lobby when E2EE is disabled', async ({ page }) => {
			// Disable E2EE
			await updateRoomConfig(roomId, {
				chat: { enabled: true },
				recording: { enabled: true, allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER },
				virtualBackground: { enabled: true },
				e2ee: { enabled: false }
			});

			await page.goto(MEET_TESTAPP_URL);
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await page.click('#join-as-speaker');

			const component = page.locator('openvidu-meet');
			await expect(component).toBeVisible();

			// Wait for participant name input
			await waitForElementInIframe(page, '#participant-name-input', { state: 'visible' });

			// Check that E2EE badge is hidden
			const e2eeBadge = await waitForElementInIframe(page, '.encryption-badge', { state: 'hidden' });
			await expect(e2eeBadge).toBeHidden();

			// Check that E2EE key input is hidden
			const e2eeKeyInput = await waitForElementInIframe(page, '#participant-e2eekey-input', {
				state: 'hidden'
			});
			await expect(e2eeKeyInput).toBeHidden();
		});
	});

	// ==========================================
	// E2EE SESSION TESTS
	// ==========================================

	test.describe('E2EE in Session', () => {
		test.afterEach(async ({ page }) => {
			try {
				await leaveRoom(page);
			} catch (error) {
				// Ignore errors if already left
			}
		});

		test('should allow participants to see and hear each other with correct E2EE key', async ({
			page,
			context
		}) => {
			// Enable E2EE
			await updateRoomConfig(roomId, {
				chat: { enabled: true },
				recording: { enabled: false, allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER },
				virtualBackground: { enabled: true },
				e2ee: { enabled: true }
			});

			// Create a second page for participant 2
			const page2 = await context.newPage();

			// Participant 1 joins with E2EE key
			await page.goto(MEET_TESTAPP_URL);
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await page.click('#join-as-speaker');

			await waitForElementInIframe(page, '#participant-name-input', { state: 'visible' });
			await interactWithElementInIframe(page, '#participant-name-input', {
				action: 'fill',
				value: participantName
			});

			// Fill E2EE key
			const e2eeKey = 'test-encryption-key-123';
			await interactWithElementInIframe(page, '#participant-e2eekey-input', {
				action: 'fill',
				value: e2eeKey
			});

			await interactWithElementInIframe(page, '#participant-name-submit', { action: 'click' });

			// Wait for prejoin page and join
			await waitForElementInIframe(page, 'ov-pre-join', { state: 'visible' });
			await interactWithElementInIframe(page, '#join-button', { action: 'click' });
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Participant 2 joins with same E2EE key
			const participant2Name = `P2-${Math.random().toString(36).substring(2, 9)}`;
			await page2.goto(MEET_TESTAPP_URL);
			await prepareForJoiningRoom(page2, MEET_TESTAPP_URL, roomId);
			await page2.click('#join-as-speaker');

			await waitForElementInIframe(page2, '#participant-name-input', { state: 'visible' });
			await interactWithElementInIframe(page2, '#participant-name-input', {
				action: 'fill',
				value: participant2Name
			});

			// Fill same E2EE key
			await interactWithElementInIframe(page2, '#participant-e2eekey-input', {
				action: 'fill',
				value: e2eeKey
			});

			await interactWithElementInIframe(page2, '#participant-name-submit', { action: 'click' });

			// Wait for prejoin page and join
			await waitForElementInIframe(page2, 'ov-pre-join', { state: 'visible' });
			await interactWithElementInIframe(page2, '#join-button', { action: 'click' });
			await waitForElementInIframe(page2, 'ov-session', { state: 'visible' });

			// Wait a bit for media to flow
			await page.waitForTimeout(2000);

			// Check that both participants can see each other's video elements
			const videoCount1 = await countElementsInIframe(page, '.OV_video-element');
			expect(videoCount1).toBeGreaterThanOrEqual(2);

			const videoCount2 = await countElementsInIframe(page2, '.OV_video-element');
			expect(videoCount2).toBeGreaterThanOrEqual(2);

			// Check that no encryption error poster is shown
			const encryptionError1 = await waitForElementInIframe(page, '.encryption-error-poster', {
				state: 'hidden'
			});
			await expect(encryptionError1).toBeHidden();

			const encryptionError2 = await waitForElementInIframe(page2, '.encryption-error-poster', {
				state: 'hidden'
			});
			await expect(encryptionError2).toBeHidden();

			// Cleanup participant 2
			await leaveRoom(page2);
			await page2.close();
		});

		test('should show encryption error poster when using wrong E2EE key', async ({ page, context }) => {
			// Enable E2EE
			await updateRoomConfig(roomId, {
				chat: { enabled: true },
				recording: { enabled: false, allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER },
				virtualBackground: { enabled: true },
				e2ee: { enabled: true }
			});

			// Create a second page for participant 2
			const page2 = await context.newPage();

			// Participant 1 joins with E2EE key
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await page.click('#join-as-speaker');

			await waitForElementInIframe(page, '#participant-name-input', { state: 'visible' });
			await interactWithElementInIframe(page, '#participant-name-input', {
				action: 'fill',
				value: participantName
			});

			// Fill E2EE key
			const e2eeKey1 = 'correct-key-abc';
			await interactWithElementInIframe(page, '#participant-e2eekey-input', {
				action: 'fill',
				value: e2eeKey1
			});

			await interactWithElementInIframe(page, '#participant-name-submit', { action: 'click' });

			// Wait for prejoin page and join
			await waitForElementInIframe(page, 'ov-pre-join', { state: 'visible' });
			await interactWithElementInIframe(page, '#join-button', { action: 'click' });
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Participant 2 joins with DIFFERENT E2EE key
			const participant2Name = `P2-${Math.random().toString(36).substring(2, 9)}`;
			await prepareForJoiningRoom(page2, MEET_TESTAPP_URL, roomId);
			await page2.click('#join-as-speaker');

			await waitForElementInIframe(page2, '#participant-name-input', { state: 'visible' });
			await interactWithElementInIframe(page2, '#participant-name-input', {
				action: 'fill',
				value: participant2Name
			});

			// Fill DIFFERENT E2EE key
			const e2eeKey2 = 'wrong-key-xyz';
			await interactWithElementInIframe(page2, '#participant-e2eekey-input', {
				action: 'fill',
				value: e2eeKey2
			});

			await interactWithElementInIframe(page2, '#participant-name-submit', { action: 'click' });

			// Wait for prejoin page and join
			await waitForElementInIframe(page2, 'ov-pre-join', { state: 'visible' });
			await interactWithElementInIframe(page2, '#join-button', { action: 'click' });
			await waitForElementInIframe(page2, 'ov-session', { state: 'visible' });

			// Wait for encryption error to be detected
			await page.waitForTimeout(3000);

			// Check that encryption error poster is shown on both sides
			// Each participant should see an encryption error for the other's video
			const videoPosterCount = await countElementsInIframe(page, '.encryption-error-poster');

			//! FIXME: Temporarily expecting 2 posters due to audio and video streams (needs to be fixed in ov-components)
			expect(videoPosterCount).toBe(2);

			const videoPosterCount2 = await countElementsInIframe(page2, '.encryption-error-poster');
			//! FIXME: Temporarily expecting 2 posters due to audio and video streams (needs to be fixed in ov-components)
			expect(videoPosterCount2).toBe(2);

			// Add additional participant with correct key to verify they can see/hear each other
			const page3 = await context.newPage();
			const participant3Name = `P3-${Math.random().toString(36).substring(2, 9)}`;
			await prepareForJoiningRoom(page3, MEET_TESTAPP_URL, roomId);
			await page3.click('#join-as-speaker');

			await waitForElementInIframe(page3, '#participant-name-input', { state: 'visible' });
			await interactWithElementInIframe(page3, '#participant-name-input', {
				action: 'fill',
				value: participant3Name
			});

			// Fill CORRECT E2EE key
			await interactWithElementInIframe(page3, '#participant-e2eekey-input', {
				action: 'fill',
				value: e2eeKey1
			});

			await interactWithElementInIframe(page3, '#participant-name-submit', { action: 'click' });

			// Wait for prejoin page and join
			await waitForElementInIframe(page3, 'ov-pre-join', { state: 'visible' });
			await interactWithElementInIframe(page3, '#join-button', { action: 'click' });
			await waitForElementInIframe(page3, 'ov-session', { state: 'visible' });

			// Wait a bit for media to flow
			await page3.waitForTimeout(2000);

			// Check that participant 3 can see participant 1's video
			const videoCount3 = await countElementsInIframe(page3, '.OV_video-element');
			expect(videoCount3).toBeGreaterThanOrEqual(2);

			const videoPosterCount3 = await countElementsInIframe(page3, '.encryption-error-poster');
			//! FIXME: Temporarily expecting 2 posters due to audio and video streams (needs to be fixed in ov-components)
			expect(videoPosterCount3).toBe(2);

			// Cleanup participant 2
			await Promise.all([leaveRoom(page2), leaveRoom(page3)]);
			await Promise.all([page2.close(), page3.close()]);
		});
	});

	// ==========================================
	// E2EE AND RECORDING INTERACTION TESTS
	// ==========================================

	test.describe('E2EE and Recording', () => {
		test.afterEach(async ({ page }) => {
			try {
				await leaveRoom(page, 'moderator');
			} catch (error) {
				// Ignore errors if already left
			}
		});

		test('should hide recording button when E2EE is enabled', async ({ page }) => {
			// Enable E2EE (which should auto-disable recording)
			await updateRoomConfig(roomId, {
				chat: { enabled: true },
				recording: { enabled: false, allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER },
				virtualBackground: { enabled: true },
				e2ee: { enabled: true }
			});

			await page.goto(MEET_TESTAPP_URL);
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);

			// Join as moderator to access recording controls
			await page.click('#join-as-moderator');
			const component = page.locator('openvidu-meet');
			await expect(component).toBeVisible();

			// Fill participant name
			await waitForElementInIframe(page, '#participant-name-input', { state: 'visible' });
			await interactWithElementInIframe(page, '#participant-name-input', {
				action: 'fill',
				value: participantName
			});

			// Fill E2EE key
			const e2eeKey = 'test-key-recording';
			await interactWithElementInIframe(page, '#participant-e2eekey-input', {
				action: 'fill',
				value: e2eeKey
			});

			await interactWithElementInIframe(page, '#participant-name-submit', { action: 'click' });

			// Wait for prejoin page and join
			await waitForElementInIframe(page, 'ov-pre-join', { state: 'visible' });
			await interactWithElementInIframe(page, '#join-button', { action: 'click' });
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Open more options menu
			await openMoreOptionsMenu(page);

			// Check that recording button is not visible
			const recordingButton = await waitForElementInIframe(page, '#recording-btn', { state: 'hidden' });
			await expect(recordingButton).toBeHidden();

			await closeMoreOptionsMenu(page);

			// Also check that recording activities panel is not available
			const activitiesButton = await waitForElementInIframe(page, '#activities-panel-btn', { state: 'hidden' });
			await expect(activitiesButton).toBeHidden();
		});
	});
});
