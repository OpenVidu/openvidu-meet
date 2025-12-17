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
	// E2EE MEETING TESTS
	// ==========================================

	test.describe('E2EE in Meeting', () => {
		test.afterEach(async ({ page }) => {
			try {
				await leaveRoom(page, 'speaker', true);
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

			// Expect video to be flowing (by checking the video element has video tracks)
			const videoElements = await waitForElementInIframe(page, '.OV_video-element', {
				state: 'visible',
				all: true
			});
			for (const videoElement of videoElements) {
				const videoTracks = await videoElement.evaluate((el) => (el as any).srcObject?.getVideoTracks());
				expect(videoTracks.length).toBeGreaterThan(0);
			}

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

		test('should decrypt participant names and chat messages with correct E2EE key', async ({ page, context }) => {
			// Enable E2EE
			await updateRoomConfig(roomId, {
				chat: { enabled: true },
				recording: { enabled: false, allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER },
				virtualBackground: { enabled: true },
				e2ee: { enabled: true }
			});

			const e2eeKey = 'shared-encryption-key-456';
			const participant1Name = `Alice-${Math.random().toString(36).substring(2, 9)}`;
			const participant2Name = `Bob-${Math.random().toString(36).substring(2, 9)}`;

			// Participant 1 joins with E2EE key
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await page.click('#join-as-speaker');

			await waitForElementInIframe(page, '#participant-name-input', { state: 'visible' });
			await interactWithElementInIframe(page, '#participant-name-input', {
				action: 'fill',
				value: participant1Name
			});

			await interactWithElementInIframe(page, '#participant-e2eekey-input', {
				action: 'fill',
				value: e2eeKey
			});

			await interactWithElementInIframe(page, '#participant-name-submit', { action: 'click' });
			await waitForElementInIframe(page, 'ov-pre-join', { state: 'visible' });
			await interactWithElementInIframe(page, '#join-button', { action: 'click' });
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Participant 2 joins with same E2EE key
			const page2 = await context.newPage();
			await prepareForJoiningRoom(page2, MEET_TESTAPP_URL, roomId);
			await page2.click('#join-as-speaker');

			await waitForElementInIframe(page2, '#participant-name-input', { state: 'visible' });
			await interactWithElementInIframe(page2, '#participant-name-input', {
				action: 'fill',
				value: participant2Name
			});

			await interactWithElementInIframe(page2, '#participant-e2eekey-input', {
				action: 'fill',
				value: e2eeKey
			});

			await interactWithElementInIframe(page2, '#participant-name-submit', { action: 'click' });
			await waitForElementInIframe(page2, 'ov-pre-join', { state: 'visible' });
			await interactWithElementInIframe(page2, '#join-button', { action: 'click' });
			await waitForElementInIframe(page2, 'ov-session', { state: 'visible' });

			// Wait for participants to connect
			await page.waitForTimeout(2000);

			// ===== CHECK PARTICIPANT NAMES IN VIDEO GRID =====
			// Participant 1 should see Participant 2's name decrypted
			const participantNameElements = await Promise.all([
				waitForElementInIframe(page, '#participant-name', {
					state: 'attached',
					all: true
				}),
				waitForElementInIframe(page2, '#participant-name', {
					state: 'attached',
					all: true
				})
			]);

			for (const participantNameElement of participantNameElements.flat()) {
				const name = await participantNameElement.evaluate((el) => el.textContent);
				expect(name.includes(participant1Name) || name.includes(participant2Name)).toBeTruthy();
				expect(name).not.toContain('*');
			}

			// ===== CHECK NAMES IN PARTICIPANTS PANEL =====
			// Open participants panel
			await Promise.all([
				interactWithElementInIframe(page, '#participants-panel-btn', { action: 'click' }),
				interactWithElementInIframe(page2, '#participants-panel-btn', { action: 'click' })
			]);
			await Promise.all([
				waitForElementInIframe(page, 'ov-participants-panel', { state: 'visible' }),
				waitForElementInIframe(page2, 'ov-participants-panel', { state: 'visible' })
			]);
			// Check that both names are visible and decrypted in the panel
			const participantsPanelNames = await Promise.all([
				waitForElementInIframe(page, '.participant-item-name span', {
					state: 'attached',
					all: true
				}),
				waitForElementInIframe(page2, '.participant-item-name span', {
					state: 'attached',
					all: true
				})
			]);

			for (const participantPanelName of participantsPanelNames.flat()) {
				const name = await participantPanelName.evaluate((el) => el.textContent);
				expect(name.includes(participant1Name) || name.includes(participant2Name)).toBeTruthy();
				expect(name).not.toContain('*');
			}

			// Close participants panel
			await Promise.all([
				interactWithElementInIframe(page, '#participants-panel-btn', { action: 'click' }),
				interactWithElementInIframe(page2, '#participants-panel-btn', { action: 'click' })
			]);
			await Promise.all([
				waitForElementInIframe(page, 'ov-participants-panel', { state: 'hidden' }),
				waitForElementInIframe(page2, 'ov-participants-panel', { state: 'hidden' })
			]);

			// ===== CHECK OWN NAME IN SETTINGS PANEL =====
			// Open settings panel
			await Promise.all([openMoreOptionsMenu(page), openMoreOptionsMenu(page2)]);
			await Promise.all([
				interactWithElementInIframe(page, '#toolbar-settings-btn', { action: 'click' }),
				interactWithElementInIframe(page2, '#toolbar-settings-btn', { action: 'click' })
			]);
			await Promise.all([
				waitForElementInIframe(page, 'ov-settings-panel', { state: 'visible' }),
				waitForElementInIframe(page2, 'ov-settings-panel', { state: 'visible' })
			]);

			// Check that own name is visible and decrypted
			const ownNameInputs = await Promise.all([
				waitForElementInIframe(page, '#participant-name-input', {
					state: 'visible'
				}),
				waitForElementInIframe(page2, '#participant-name-input', { state: 'visible' })
			]);

			const ownName1 = await ownNameInputs[0].evaluate((el: HTMLInputElement) => el.value);
			const ownName2 = await ownNameInputs[1].evaluate((el: HTMLInputElement) => el.value);
			expect(ownName1).toBe(participant1Name);
			expect(ownName1).not.toContain('*');
			expect(ownName2).toBe(participant2Name);
			expect(ownName2).not.toContain('*');

			// Close settings panel
			await Promise.all([
				interactWithElementInIframe(page, '.panel-close-button', { action: 'click' }),
				interactWithElementInIframe(page2, '.panel-close-button', { action: 'click' })
			]);
			await Promise.all([
				waitForElementInIframe(page, 'ov-settings-panel', { state: 'hidden' }),
				waitForElementInIframe(page2, 'ov-settings-panel', { state: 'hidden' })
			]);
			await Promise.all([closeMoreOptionsMenu(page), closeMoreOptionsMenu(page2)]);

			// ===== CHECK CHAT MESSAGES =====
			// Open chat
			await Promise.all([
				interactWithElementInIframe(page, '#chat-panel-btn', { action: 'click' }),
				interactWithElementInIframe(page2, '#chat-panel-btn', { action: 'click' })
			]);
			await Promise.all([
				waitForElementInIframe(page, 'ov-chat-panel', { state: 'visible' }),
				waitForElementInIframe(page2, 'ov-chat-panel', { state: 'visible' })
			]);

			// ===== MESSAGE: PARTICIPANT 1 → PARTICIPANT 2 =====
			const testMessage1 = `Hello from ${participant1Name}!`;
			await Promise.all([
				interactWithElementInIframe(page, '#chat-input', { action: 'fill', value: testMessage1 }),
				waitForElementInIframe(page2, 'ov-chat-panel', { state: 'visible' })
			]);

			await interactWithElementInIframe(page, '#send-btn', { action: 'click' });

			// Wait for message to be sent
			await page.waitForTimeout(1000);

			// Open chat on page 2
			const chatMessages2 = await waitForElementInIframe(page2, '.chat-message', { state: 'visible' });

			// Verify message content
			const messageText2 = await chatMessages2.evaluate((el) => el.textContent || '');
			expect(messageText2).toContain(testMessage1);
			expect(messageText2).not.toContain('*');

			// ===== MESSAGE: PARTICIPANT 2 → PARTICIPANT 1 =====
			const testMessage2 = `Hi from ${participant2Name}!`;

			// Send message in page2 iframe
			await interactWithElementInIframe(page2, '#chat-input', { action: 'fill', value: testMessage2 });
			await interactWithElementInIframe(page2, '#send-btn', { action: 'click' });

			// Wait briefly for message delivery
			await page.waitForTimeout(1000);

			// Wait for message on participant 1’s side
			const chatMessages1 = await waitForElementInIframe(page, '.chat-message', { state: 'visible' });

			// Collect all chat messages in the chat panel
			const allMessages1 = await chatMessages1.evaluate((el) =>
				Array.from(el.closest('ov-chat-panel')?.querySelectorAll('.chat-message') || []).map(
					(e) => e.textContent || ''
				)
			);

			// Verify received message
			expect(allMessages1.join(' ')).toContain(testMessage2);
			expect(allMessages1.join(' ')).not.toContain('*');

			// Cleanup
			await leaveRoom(page2);
			await page2.close();
		});

		test('should show masked names and unreadable messages for participant with wrong E2EE key', async ({
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

			const correctKey = 'correct-shared-key-789';
			const wrongKey = 'wrong-key-999';
			const participant1Name = `Charlie-${Math.random().toString(36).substring(2, 9)}`;
			const participant2Name = `David-${Math.random().toString(36).substring(2, 9)}`;
			const participant3Name = `Eve-${Math.random().toString(36).substring(2, 9)}`;
			const [page2, page3] = await Promise.all([context.newPage(), context.newPage()]);

			// Prepare for all participants to join the room
			await Promise.all([
				prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId),
				prepareForJoiningRoom(page2, MEET_TESTAPP_URL, roomId),
				prepareForJoiningRoom(page3, MEET_TESTAPP_URL, roomId)
			]);

			// Join as speaker in all pages
			await Promise.all([
				page.click('#join-as-speaker'),
				page2.click('#join-as-speaker'),
				page3.click('#join-as-speaker')
			]);

			// Wait for name and E2EE key inputs to be visible in all pages
			await Promise.all([
				waitForElementInIframe(page, '#participant-name-input', { state: 'visible' }),
				waitForElementInIframe(page, '#participant-e2eekey-input', { state: 'visible' }),
				waitForElementInIframe(page2, '#participant-name-input', { state: 'visible' }),
				waitForElementInIframe(page2, '#participant-e2eekey-input', { state: 'visible' }),
				waitForElementInIframe(page3, '#participant-name-input', { state: 'visible' }),
				waitForElementInIframe(page3, '#participant-e2eekey-input', { state: 'visible' })
			]);

			// Fill participant names
			await Promise.all([
				interactWithElementInIframe(page, '#participant-name-input', {
					action: 'fill',
					value: participant1Name
				}),
				interactWithElementInIframe(page2, '#participant-name-input', {
					action: 'fill',
					value: participant2Name
				}),
				interactWithElementInIframe(page3, '#participant-name-input', {
					action: 'fill',
					value: participant3Name
				})
			]);

			// Fill E2EE keys (two correct, one wrong)
			await Promise.all([
				interactWithElementInIframe(page, '#participant-e2eekey-input', { action: 'fill', value: correctKey }),
				interactWithElementInIframe(page2, '#participant-e2eekey-input', { action: 'fill', value: correctKey }),
				interactWithElementInIframe(page3, '#participant-e2eekey-input', { action: 'fill', value: wrongKey })
			]);

			// Join all participants
			await Promise.all([
				interactWithElementInIframe(page, '#participant-name-submit', { action: 'click' }),
				interactWithElementInIframe(page2, '#participant-name-submit', { action: 'click' }),
				interactWithElementInIframe(page3, '#participant-name-submit', { action: 'click' })
			]);

			// Wait for prejoin page in all pages
			await Promise.all([
				waitForElementInIframe(page, 'ov-pre-join', { state: 'visible' }),
				waitForElementInIframe(page2, 'ov-pre-join', { state: 'visible' }),
				waitForElementInIframe(page3, 'ov-pre-join', { state: 'visible' })
			]);

			// Click join button in all pages
			await Promise.all([
				interactWithElementInIframe(page, '#join-button', { action: 'click' }),
				interactWithElementInIframe(page2, '#join-button', { action: 'click' }),
				interactWithElementInIframe(page3, '#join-button', { action: 'click' })
			]);

			// Wait for session to be visible in all pages
			await Promise.all([
				waitForElementInIframe(page, 'ov-session', { state: 'visible' }),
				waitForElementInIframe(page2, 'ov-session', { state: 'visible' }),
				waitForElementInIframe(page3, 'ov-session', { state: 'visible' })
			]);

			// Wait for participants to connect
			await page.waitForTimeout(1000);

			// Check that participant 3 sees encryption error posters for others
			// ===== CHECK MASKED NAMES IN VIDEO GRID FOR PARTICIPANT 3 =====
			const participantNameElements3 = await waitForElementInIframe(
				page3,
				'#layout .participant-name-container #participant-name',
				{
					state: 'attached',
					all: true
				}
			);
			const participantNames3 = await Promise.all(
				participantNameElements3.map((el) => el.evaluate((e) => e.textContent))
			);

			// Should have exactly 3 participants
			expect(participantNames3.length).toBe(3);

			// Should NOT all be masked (own name should be visible)
			expect(participantNames3.every((name) => name?.includes('******'))).toBeFalsy();

			// Should have exactly 2 masked names
			const maskedNames = participantNames3.filter((name) => name?.includes('******'));
			expect(maskedNames.length).toBe(2);

			// Should see own name
			expect(participantNames3).toContain(participant3Name);

			// Should NOT see the actual names of P1 and P2
			expect(participantNames3.join(' ')).not.toContain(participant1Name);
			expect(participantNames3.join(' ')).not.toContain(participant2Name);

			// ===== CHECK MASKED NAMES IN PARTICIPANTS PANEL =====
			await interactWithElementInIframe(page3, '#participants-panel-btn', { action: 'click' });
			await waitForElementInIframe(page3, 'ov-participants-panel', { state: 'visible' });

			const participantsPanelNames3 = await waitForElementInIframe(page3, '.participant-name-text', {
				state: 'visible',
				all: true
			});
			const panelNamesText3 = await Promise.all(
				participantsPanelNames3.map((el) => el.evaluate((e) => e.textContent))
			);

			// Should have exactly 3 participants in panel
			expect(panelNamesText3.length).toBe(3);

			// Should NOT all be masked (own name should be visible)
			expect(panelNamesText3.every((name) => name?.includes('******'))).toBeFalsy();

			// Should have exactly 2 masked names
			const maskedPanelNames = panelNamesText3.filter((name) => name?.includes('******'));
			expect(maskedPanelNames.length).toBe(2);

			// Should see own name
			expect(panelNamesText3).toContain(participant3Name);

			// Should NOT see the actual names of P1 and P2
			expect(panelNamesText3.join(' ')).not.toContain(participant1Name);
			expect(panelNamesText3.join(' ')).not.toContain(participant2Name);

			await interactWithElementInIframe(page3, '#participants-panel-btn', { action: 'click' });
			await waitForElementInIframe(page3, 'ov-participants-panel', { state: 'hidden' });

			// ===== CHECK OWN NAME IN SETTINGS PANEL =====
			await openMoreOptionsMenu(page3);
			await interactWithElementInIframe(page3, '#toolbar-settings-btn', { action: 'click' });
			await waitForElementInIframe(page3, 'ov-settings-panel', { state: 'visible' });

			const ownNameInput3 = await waitForElementInIframe(page3, '#participant-name-input', { state: 'visible' });
			const ownName3 = await ownNameInput3.evaluate((el: HTMLInputElement) => el.value);
			expect(ownName3).toBe(participant3Name);
			expect(ownName3).not.toContain('******');

			await interactWithElementInIframe(page3, '.panel-close-button', { action: 'click' });
			await waitForElementInIframe(page3, 'ov-settings-panel', { state: 'hidden' });
			await closeMoreOptionsMenu(page3);

			// ===== SEND MESSAGE FROM PARTICIPANT 1 =====
			const secretMessage = `Secret message from ${participant1Name}`;
			await Promise.all([
				interactWithElementInIframe(page, '#chat-panel-btn', { action: 'click' }),
				waitForElementInIframe(page, 'ov-chat-panel', { state: 'visible' })
			]);

			// Send message
			await interactWithElementInIframe(page, '#chat-input', { action: 'fill', value: secretMessage });
			await interactWithElementInIframe(page, '#send-btn', { action: 'click' });

			await page.waitForTimeout(20000)
			// Wait for message to be sent and received
			// await Promise.all([
			// 	waitForElementInIframe(page2, '#chat-panel-btn .mat-badge-content', { state: 'visible' }),
			// 	waitForElementInIframe(page3, '#chat-panel-btn .mat-badge-content', { state: 'visible' })
			// ]);

			// ===== CHECK CHAT MESSAGES ARE UNREADABLE =====
			await interactWithElementInIframe(page3, '#chat-panel-btn', { action: 'click' });
			await waitForElementInIframe(page3, 'ov-chat-panel', { state: 'visible' });

			await page3.waitForTimeout(1000);

			const chatMessagesCount = await countElementsInIframe(page3, '.chat-message');
			expect(chatMessagesCount).toBe(0);

			const chatMessages3 = await waitForElementInIframe(page3, '.chat-message', {
				state: 'visible',
				all: true
			});
			const messagesText3 = await Promise.all(chatMessages3.map((el) => el.evaluate((e) => e.textContent)));

			console.log('Chat Messages Seen by Participant 3:', messagesText3);
			console.log('Expected: All messages masked, got:', messagesText3.length, 'messages');

			expect(messagesText3.length).toBe(0);

			// All messages should contain the mask
			// expect(messagesText3.every((text) => text?.includes('******'))).toBeTruthy();

			// Should NOT contain the actual secret message
			// expect(messagesText3.join(' ')).not.toContain(secretMessage);

			// ===== VERIFY PARTICIPANTS 1 AND 2 CAN STILL SEE EACH OTHER =====
			const participantNameElements1 = await waitForElementInIframe(page, '.participant-name', {
				state: 'visible',
				all: true
			});
			const participantNames1 = await Promise.all(
				participantNameElements1.map((el) => el.evaluate((e) => e.textContent))
			);
			expect(participantNames1.join(' ')).toContain(participant2Name);

			const participantNameElements2 = await waitForElementInIframe(page2, '.participant-name', {
				state: 'visible',
				all: true
			});
			const participantNames2 = await Promise.all(
				participantNameElements2.map((el) => el.evaluate((e) => e.textContent))
			);
			expect(participantNames2.join(' ')).toContain(participant1Name);

			// Cleanup
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
				await leaveRoom(page, 'moderator', true);
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
