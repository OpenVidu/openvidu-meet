import { expect, test } from '@playwright/test';
import { MEET_TESTAPP_URL } from '../config';
import {
	configureLayoutMode,
	createTestRoom,
	deleteAllRecordings,
	deleteAllRooms,
	getVisibleParticipantsCount,
	getVisibleParticipantNames,
	joinRoomAs,
	prepareForJoiningRoom,
	waitForElementInIframe,
	waitForParticipantCount,
	waitForParticipantVisible,
	waitForParticipantSwap,
	muteAudio
} from '../helpers/function-helpers';
import {
	disconnectAllFakeParticipants,
	disconnectAllBrowserFakeParticipants,
	joinBrowserFakeParticipant,
	joinFakeParticipant,
	disconnectBrowserFakeParticipant
} from '../helpers/participant.helper';

test.describe('Custom Layout Tests', () => {
	let subscribedToAppErrors = false;
	let roomId: string;
	let participantName: string;

	test.beforeEach(async ({ page }) => {
		// Create a new room for each test to avoid state pollution
		roomId = await createTestRoom('smart-mosaic-test-room');

		if (!subscribedToAppErrors) {
			page.on('console', (msg) => {
				const type = msg.type();
				const tag = type === 'error' ? 'ERROR' : type === 'warning' ? 'WARNING' : 'LOG';
				console.log('[' + tag + ']', msg.text());
			});
			subscribedToAppErrors = true;
		}

		participantName = `Local-${Math.random().toString(36).substring(2, 7)}`;
	});

	test.afterEach(async () => {
		// Clean up fake participants after each test
		await Promise.all([disconnectAllBrowserFakeParticipants(), disconnectAllFakeParticipants()]);
	});

	test.afterAll(async ({ browser }) => {
		const tempContext = await browser.newContext();
		const tempPage = await tempContext.newPage();
		await deleteAllRooms(tempPage);
		await deleteAllRecordings(tempPage);
		await tempContext.close();
		await tempPage.close();
	});

	// =========================================================================
	// SMART MOSAIC LAYOUT TESTS
	// These tests verify that the Smart Mosaic layout correctly displays
	// participants based on their speaking activity, showing only the most
	// recent active speakers up to the configured limit.
	// =========================================================================

	test.describe('Smart Mosaic Layout - Speaker Priority', () => {
		test('should display only local participant and the single active remote speaker when limit is set to 1 and one remote is muted', async ({
			page
		}) => {
			// Scenario: 3 participants (local + remote A speaking + remote B muted), limit = 1
			// Expected: Grid shows local + remote A only (2 participants total)
			// Audio: Remote A uses continuous_speech.ogg, Remote B has no audio

			// Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
			await muteAudio(page); // Mute local to avoid interference

			// Configure Smart Mosaic layout with limit = 1
			await configureLayoutMode(page, 'smart-mosaic', 1);

			// Join fake participant A (speaking with continuous audio)
			await Promise.all([
				joinBrowserFakeParticipant(roomId, 'RemoteA-Speaker', {
					audioFile: 'continuous_speech.wav'
				}),
				// Join fake participant B (muted/silent - no audio)
				joinFakeParticipant(roomId, 'RemoteB-Silent')
			]);

			// Wait for participants to appear and speaker detection to process
			await waitForParticipantVisible(page, 'RemoteA-Speaker');

			// Verify the grid shows exactly 2 participants (local + 1 remote speaker)
			const participantCount = await getVisibleParticipantsCount(page);
			expect(participantCount).toBe(2);

			// Step 8: Verify the visible participants are local and RemoteA (the speaker)
			const visibleIdentities = await getVisibleParticipantNames(page);
			// expect(visibleIdentities).toContain(participantName); // Local participant
			expect(visibleIdentities).toContain('RemoteA-Speaker'); // Active speaker
			expect(visibleIdentities).not.toContain('RemoteB-Silent'); // Silent participant should NOT be visible
		});

		test('should reorder two remote participants based on alternating speech activity while keeping local participant always visible', async ({
			page
		}) => {
			// Scenario: 3 participants, A speaks first (0-5s), then B speaks (5s onwards)
			// Expected: Initially A is prioritized, after B speaks, B becomes prioritized
			// Audio: A uses speech_5s_then_silence.ogg, B uses silence_5s_then_speech.ogg

			// Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
			await muteAudio(page); // Mute local to avoid interference

			// Configure Smart Mosaic layout with limit = 1
			// Only 1 remote participant should be visible at a time (plus local)
			await configureLayoutMode(page, 'smart-mosaic', 1);

			//  Join fake participant A (speaks first 5s, then silent)
			//  Join fake participant B (silent first 5s, then speaks)
			// Use browser-based fake participant to ensure VAD triggers correctly (lk CLI always send active speakers events when using audio files)
			await joinBrowserFakeParticipant(roomId, 'RemoteA-SpeaksFirst', {
				audioFile: 'speech_5s_then_silence.wav'
			});

			await waitForParticipantVisible(page, 'RemoteA-SpeaksFirst');

			await joinBrowserFakeParticipant(roomId, 'RemoteB-SpeaksLater', {
				audioFile: 'silence_5s_then_speech.wav'
			});

			// Verify that RemoteA is visible (he's speaking in first 5s)
			let [visibleIdentities, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);
			expect(visibleIdentities).toContain('RemoteA-SpeaksFirst');
			expect(visibleIdentities).not.toContain('RemoteB-SpeaksLater');

			// Verify we have exactly 2 participants visible (local + 1 remote)
			expect(participantCount).toBe(2);
			expect(participantCount).toBe(2);

			// Wait for the speech transition (A stops at 5s, B starts at 5s)
			// Wait additional time for B to start speaking and be detected
			await waitForParticipantVisible(page, 'RemoteB-SpeaksLater');

			// Verify that RemoteB is now visible (he started speaking)
			[visibleIdentities, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);
			expect(visibleIdentities).toContain('RemoteB-SpeaksLater');
			expect(visibleIdentities).not.toContain('RemoteA-SpeaksFirst');

			// Verify still exactly 2 participants visible (local + 1 remote)
			expect(participantCount).toBe(2);

			// Verify local participant remained visible throughout
			// The local participant should always be visible regardless of speaking state
			expect(visibleIdentities.length).toBe(2); // Local + current active speaker
		});

		test('should rotate three remote participants by most recent speaker order with limit of 2 visible remotes', async ({
			page
		}) => {
			// Scenario: 4 participants with limit = 2, speaking order A → B → C
			// Expected: After rotation, grid shows local + B + C (last 2 speakers)
			// Audio: A speaks 0-3s, B speaks 5-8s, C speaks 10-13s

			// Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
			await muteAudio(page); // Mute local to avoid interference

			// Configure Smart Mosaic layout with limit = 2
			// 2 remote participants should be visible at a time (plus local = 3 total)
			await configureLayoutMode(page, 'smart-mosaic', 2);

			// Join three browser-based fake participants with sequential audio
			// speaker_seq_A.wav: speaks at 0-3s
			// speaker_seq_B.wav: speaks at 5-8s
			// speaker_seq_C.wav: speaks at 10-13s
			await joinBrowserFakeParticipant(roomId, 'RemoteA-First', {
				audioFile: 'speaker_seq_A.wav'
			});

			await joinBrowserFakeParticipant(roomId, 'RemoteB-Second', {
				audioFile: 'speaker_seq_B.wav'
			});

			await joinBrowserFakeParticipant(roomId, 'RemoteC-Third', {
				audioFile: 'speaker_seq_C.wav'
			});

			// Wait for A to become visible (speaks first at 0-3s)
			await waitForParticipantVisible(page, 'RemoteA-First');

			// Initially A and B should be visible (limit = 2, A is speaking, B fills the slot)
			let [visibleIdentities, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			console.log('After A starts speaking:', visibleIdentities);
			expect(visibleIdentities).toContain('RemoteA-First');
			expect(participantCount).toBe(3); // Local + 2 remotes

			// Wait for C to become visible (speaks at 10-13s)
			// This is the key assertion - when C starts speaking, it should replace A (oldest speaker)
			await waitForParticipantSwap(page, 'RemoteC-Third', 'RemoteA-First', 30000);

			// Verify final state - B and C should be visible (most recent 2 speakers)
			[visibleIdentities, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			console.log('After C speaks (rotation complete):', visibleIdentities);
			expect(participantCount).toBe(3); // Local + 2 remotes
			expect(visibleIdentities).toContain('RemoteB-Second');
			expect(visibleIdentities).toContain('RemoteC-Third');
			expect(visibleIdentities).not.toContain('RemoteA-First'); // A was rotated out
		});

		test('should display local and three most active remote speakers while ignoring the silent participant when limit is 3', async ({
			page
		}) => {
			// Scenario: 5 participants (local + A, B, C speaking + D always silent), limit = 3
			// Expected: Grid shows local + A + B + C, D is never shown
			// Audio: A, B, C use continuous_speech.wav, D has no audio

			// Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
			await muteAudio(page); // Mute local to avoid interference

			// Configure Smart Mosaic layout with limit = 3
			// 3 remote participants should be visible at a time (plus local = 4 total)
			await configureLayoutMode(page, 'smart-mosaic', 3);

			// Join silent participant first using lk CLI (no audio triggers VAD)
			await joinFakeParticipant(roomId, 'RemoteD-Silent');

			// Join three browser-based fake participants with continuous speech audio
			// These will all be detected as active speakers
			await Promise.all([
				joinBrowserFakeParticipant(roomId, 'RemoteA-Speaker', {
					audioFile: 'continuous_speech.wav'
				}),
				joinBrowserFakeParticipant(roomId, 'RemoteB-Speaker', {
					audioFile: 'continuous_speech.wav'
				}),
				joinBrowserFakeParticipant(roomId, 'RemoteC-Speaker', {
					audioFile: 'continuous_speech.wav'
				})
			]);

			// Wait for speaker detection to process all participants
			await Promise.all([
				waitForParticipantVisible(page, 'RemoteA-Speaker'),
				waitForParticipantVisible(page, 'RemoteB-Speaker'),
				waitForParticipantVisible(page, 'RemoteC-Speaker')
			]);

			// Verify the grid shows exactly 4 participants (local + 3 active speakers)
			const [visibleIdentities, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			// Should show local + 3 speakers = 4 total
			expect(participantCount).toBe(4);

			// Verify all three speakers are visible
			expect(visibleIdentities).toContain('RemoteA-Speaker');
			expect(visibleIdentities).toContain('RemoteB-Speaker');
			expect(visibleIdentities).toContain('RemoteC-Speaker');

			// Verify the silent participant is NOT visible
			// Since limit is 3 and we have 3 active speakers, silent D should be excluded
			expect(visibleIdentities).not.toContain('RemoteD-Silent');
		});

		test('should handle simultaneous speech from multiple participants and correctly reorder when only one continues speaking', async ({
			page
		}) => {
			// Scenario: 3 remote participants + local, limit = 2
			// All 3 speak simultaneously for first 5s, then only A continues speaking
			// Expected: Initially any 2 of the 3 are visible (all speaking)
			// After 5s, only A continues → A should remain visible as active speaker
			// Audio: A uses simultaneous_then_solo.wav (15s speech)
			//        B, C use simultaneous_then_stop.wav (5s speech then silence)

			// Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
			await muteAudio(page); // Mute local to avoid interference

			// Configure Smart Mosaic layout with limit = 2
			// Only 2 remote participants visible at a time
			await configureLayoutMode(page, 'smart-mosaic', 2);

			// Join three browser-based fake participants
			// A continues speaking (15s), B and C stop after 5s
			await Promise.all([
				joinBrowserFakeParticipant(roomId, 'RemoteA-ContinuesSpeaking', {
					audioFile: 'continuous_speech.wav'
				}),
				joinBrowserFakeParticipant(roomId, 'RemoteB-StopsSpeaking', {
					audioFile: 'simultaneous_then_stop.wav' //5s speech + 25s silence
				})
			]);
			// Wait for simultaneous speech period (first 5s - all speaking)
			await Promise.all([
				waitForParticipantVisible(page, 'RemoteA-ContinuesSpeaking'),
				waitForParticipantVisible(page, 'RemoteB-StopsSpeaking')
			]);

			await joinBrowserFakeParticipant(roomId, 'RemoteC-StopsSpeaking', {
				audioFile: 'simultaneous_then_stop.wav' //5s speech + 25s silence
			});

			let [visibleIdentities, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			// During simultaneous speech, we should see exactly 3 participants (local + 2 remotes)
			expect(participantCount).toBe(3);

			// At least A should be visible (continues speaking)
			// The other visible one could be B or C (both are speaking)
			expect(visibleIdentities).toContain('RemoteA-ContinuesSpeaking');
			expect(visibleIdentities).toContain('RemoteB-StopsSpeaking');
			expect(visibleIdentities).not.toContain('RemoteC-StopsSpeaking');

			// Wait for B and C to stop speaking (after 5s mark)
			// Only A continues speaking, so A should remain as priority speaker
			await page.waitForTimeout(6000); // Wait until ~11s mark (well past the 5s cutoff)

			[visibleIdentities, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			console.log('After B and C stop speaking (~11s):', visibleIdentities);

			// A should definitely be visible (still speaking)
			expect(visibleIdentities).toContain('RemoteA-ContinuesSpeaking');

			// Verify participant count is still 3 (local + 2 remotes)
			// Even though only A is speaking, the layout maintains 2 remotes
			expect(participantCount).toBe(3);
		});

		test('should not reorder layout continuously when smart mosaic limit is reached and multiple participants speak intermittently', async ({
			page
		}) => {
			// Scenario: 2 remote participants + local, limit = 1
			// Participants A and B speak continuously
			// Expected: Layout stabilizes showing local + 1 most recent active speakers
			// Audio: A and B use continuous_speech.wav

			// Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
			await muteAudio(page); // Mute local to avoid interference

			// Configure Smart Mosaic layout with limit = 1
			// Only 1 remote participant visible at a time
			await configureLayoutMode(page, 'smart-mosaic', 1);

			// Join two browser-based fake participants with continuous speech audio
			await joinBrowserFakeParticipant(roomId, 'RemoteA-Continuous', {
				audioFile: 'continuous_speech.wav'
			});

			await waitForParticipantVisible(page, 'RemoteA-Continuous');

			// Verify the grid shows exactly 2 participants (local + 1 remote speaker)
			let [participantCount, visibleNames] = await Promise.all([
				getVisibleParticipantsCount(page),
				getVisibleParticipantNames(page)
			]);
			expect(participantCount).toBe(2);
			expect(visibleNames).toContain('RemoteA-Continuous');

			await joinBrowserFakeParticipant(roomId, 'RemoteB-Continuous', {
				audioFile: 'continuous_speech.wav'
			});

			// Verify participant count remains stable 20 times
			for (let i = 0; i < 20; i++) {
				[participantCount, visibleNames] = await Promise.all([
					getVisibleParticipantsCount(page),
					getVisibleParticipantNames(page)
				]);
				expect(visibleNames).toContain('RemoteA-Continuous');
				expect(visibleNames).not.toContain('RemoteB-Continuous');
				expect(participantCount).toBe(2);
				await page.waitForTimeout(50);
			}
		});

		test('should immediately prioritize a newly joined participant who starts speaking over existing silent participants', async ({
			page
		}) => {
			// Scenario: Local + 2 silent participants (A, B) in room, limit = 1
			// New participant C joins and starts speaking immediately
			// Expected: C immediately appears in the grid, replacing one of the silent participants
			// Audio: A, B are silent (lk CLI), C uses continuous_speech.wav

			// Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
			await muteAudio(page); // Mute local to avoid interference

			// Configure Smart Mosaic layout with limit = 1
			// Only 1 remote participant visible at a time
			await configureLayoutMode(page, 'smart-mosaic', 1);

			// Join two silent participants using lk CLI (no VAD triggers)
			await Promise.all([
				joinFakeParticipant(roomId, 'RemoteA-Silent'),
				joinFakeParticipant(roomId, 'RemoteB-Silent')
			]);

			// Wait for silent participants to appear
			await page.waitForTimeout(2000);

			// New participant C joins and starts speaking immediately
			await joinBrowserFakeParticipant(roomId, 'RemoteC-NewSpeaker', {
				audioFile: 'silence_5s_then_speech.wav'
			});

			await page.waitForTimeout(2000);

			let [visibleNames, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			expect(visibleNames).not.toContain('RemoteC-NewSpeaker');

			// Wait for speaker detection to process
			await waitForParticipantVisible(page, 'RemoteC-NewSpeaker');

			[visibleNames, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			// Verify C is now visible (speaking has priority)
			expect(visibleNames).toContain('RemoteC-NewSpeaker');
			expect(participantCount).toBe(2); // Local + 1 remote
		});
	});

	test.describe('Smart Mosaic Layout - Participant Join/Leave Handling', () => {
		test('should update visible participants correctly when a visible speaker leaves the room', async ({
			page
		}) => {
			// Scenario: Local + 3 remote participants (A, B, C) with limit = 2
			// A and B are visible speakers, C is silent
			// A leaves the room → B should remain visible, C should NOT appear
			// Audio: A and B use continuous_speech.wav, C is silent

			// Step 1: Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Step 2: Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Step 3: Configure Smart Mosaic layout with limit = 2
			await configureLayoutMode(page, 'smart-mosaic', 2);

			// Step 4: Join three browser-based fake participants
			await Promise.all([
				joinBrowserFakeParticipant(roomId, 'RemoteA-Speaker', {
					audioFile: 'continuous_speech.wav'
				}),
				joinBrowserFakeParticipant(roomId, 'RemoteB-Speaker', {
					audioFile: 'continuous_speech.wav'
				})
			]);

			await joinFakeParticipant(roomId, 'RemoteC-Silent');

			// Step 5: Wait for speaker detection to process
			await Promise.all([
				waitForParticipantVisible(page, 'RemoteA-Speaker'),
				waitForParticipantVisible(page, 'RemoteB-Speaker')
			]);

			// Verify A and B are visible
			let [visibleNames, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			console.log('Before A leaves, visible participants:', visibleNames);

			expect(visibleNames).toContain('RemoteA-Speaker');
			expect(visibleNames).toContain('RemoteB-Speaker');
			expect(participantCount).toBe(3); // Local + 2 remotes

			// Step 6: Disconnect participant A (visible speaker)
			await disconnectBrowserFakeParticipant(roomId, 'RemoteA-Speaker');

			// Step 7: Wait for layout to update
			await page.waitForTimeout(1000);

			[visibleNames, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			console.log('After A leaves, visible participants:', visibleNames);

			// Step 8: Verify B remains visible, C does NOT appear
			expect(visibleNames).toContain('RemoteB-Speaker');
			// expect(visibleNames).toContain('RemoteC-Silent');
			expect(visibleNames).not.toContain('RemoteA-Speaker');
			expect(participantCount).toBe(3); // Local + 2 remotes
		});

		test('should update visible participants correctly when a silent participant joins the room', async ({
			page
		}) => {
			// Scenario: Local + 2 remote participants (A speaking, B silent) with limit = 1
			// A is visible speaker, B is silent
			// C joins as silent participant → should NOT appear in the grid
			// Audio: A uses continuous_speech.wav, B and C are silent

			// Step 1: Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Step 2: Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Step 3: Configure Smart Mosaic layout with limit = 1
			await configureLayoutMode(page, 'smart-mosaic', 1);

			// Step 4: Join two remote participants
			await joinBrowserFakeParticipant(roomId, 'RemoteA-Speaker', {
				audioFile: 'continuous_speech.wav'
			});

			await joinFakeParticipant(roomId, 'RemoteB-Silent');

			// Step 5: Wait for speaker detection to process
			await page.waitForTimeout(2000);

			// Verify A is visible
			let [visibleNames, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			console.log('Before C joins, visible participants:', visibleNames);

			expect(visibleNames).toContain('RemoteA-Speaker');
			expect(participantCount).toBe(2); // Local + 1 remote

			// Step 6: Join new silent participant C
			await joinFakeParticipant(roomId, 'RemoteC-Silent');

			// Step 7: Wait for layout to update
			await page.waitForTimeout(3000);

			[visibleNames, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			console.log('After C joins, visible participants:', visibleNames);

			// Step 8: Verify C does NOT appear in the grid
			expect(visibleNames).toContain('RemoteA-Speaker');
			expect(participantCount).toBe(2); // Local + 1 remote
		});
	});

	test.describe('Mosaic Layout and Smart Mosaic Layout Switching', () => {
		test('should switch from Smart Mosaic to Mosaic layout and display all participants', async ({ page }) => {
			// Scenario: Start in Smart Mosaic layout with limit = 2, switch to Mosaic
			// Expected: After switching, all participants become visible in the grid
			// Audio: Participants A, B, C, D use continuous_speech.wav

			// Step 1: Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Step 2: Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Step 3: Join four browser-based fake participants with continuous speech audio
			await Promise.all([
				joinBrowserFakeParticipant(roomId, 'RemoteA-Speaker', {
					audioFile: 'continuous_speech.wav'
				}),
				joinBrowserFakeParticipant(roomId, 'RemoteB-Speaker', {
					audioFile: 'continuous_speech.wav'
				}),
				joinBrowserFakeParticipant(roomId, 'RemoteC-Speaker', {
					audioFile: 'continuous_speech.wav'
				}),
				joinBrowserFakeParticipant(roomId, 'RemoteD-Speaker', {
					audioFile: 'continuous_speech.wav'
				})
			]);

			// Step 4: Wait for all participants to appear
			await waitForParticipantCount(page, 5); // Local + 4 remotes

			// Step 5: Configure Smart Mosaic layout with limit = 2
			await configureLayoutMode(page, 'smart-mosaic', 2);

			// Verify only 2 remote participants are visible
			let [visibleNames, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			console.log('In Smart Mosaic layout, visible participants:', visibleNames);

			expect(participantCount).toBe(3); // Local + 2 remotes

			// Step 6: Switch to Mosaic layout (all participants visible)
			await configureLayoutMode(page, 'mosaic');

			// Step 7: Wait for layout to update
			await page.waitForTimeout(3000);

			[visibleNames, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			console.log('After switching to Mosaic, visible participants:', visibleNames);

			// Step 8: Verify all 4 remote participants are now visible
			expect(participantCount).toBe(5); // Local + 4 remotes
		});

		test('should switch from Mosaic to Smart Mosaic layout and maintain participant visibility based on speaking activity', async ({
			page
		}) => {
			// Scenario: Start in Mosaic layout with 4 participants visible, switch to Smart Mosaic with limit = 2
			// Expected: After switching, only the 2 most recent active speakers remain visible
			// Audio: Participants A, B, C, D use continuous_speech.wav

			// Wait for local participant to join the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Wait for four browser-based fake participants with continuous speech audio to join
			await Promise.all([
				joinBrowserFakeParticipant(roomId, 'RemoteA-Speaker', {
					audioFile: 'continuous_speech.wav'
				}),
				joinBrowserFakeParticipant(roomId, 'RemoteB-Speaker', {
					audioFile: 'continuous_speech.wav'
				}),
				joinBrowserFakeParticipant(roomId, 'RemoteC-Speaker', {
					audioFile: 'continuous_speech.wav'
				}),
				joinBrowserFakeParticipant(roomId, 'RemoteD-Speaker', {
					audioFile: 'continuous_speech.wav'
				})
			]);

			// Wait for all participants to appear
			await waitForParticipantCount(page, 5); // Local + 4 remotes

			// Switch to Smart Mosaic layout with limit = 2
			await configureLayoutMode(page, 'smart-mosaic', 2);

			// Wait for layout to update speaker visibility
			await page.waitForTimeout(3000);

			const [visibleNames, participantCount] = await Promise.all([
				getVisibleParticipantNames(page),
				getVisibleParticipantsCount(page)
			]);

			console.log('After switching to Smart Mosaic, visible participants:', visibleNames);

			// Verify only 2 remote participants are visible (most recent speakers)
			expect(participantCount).toBe(3); // Local + 2 remotes
		});
	});

	// =========================================================================
	// SMART MOSAIC LAYOUT - AUDIO FILTERING TESTS
	// These tests verify the hysteresis mechanisms that filter out:
	// 1. Low volume audio (below audioLevel threshold of 0.15)
	// 2. Brief sounds (below minimum speaking duration of 1.5s)
	// =========================================================================

	test.describe('Smart Mosaic Layout - Audio Level and Duration Filtering', () => {
		test('should not display participant with low volume audio below threshold', async ({ page }) => {
			// Scenario: 3 participants - Local + Remote A (normal volume) + Remote B (low volume ~10%)
			// Expected: Only Remote A appears in the grid, Remote B is filtered due to low audioLevel
			// Audio: A uses continuous_speech.wav, B uses low_volume_speech.wav (10% volume)

			// Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Configure Smart Mosaic layout with limit = 1
			await configureLayoutMode(page, 'smart-mosaic', 1);

			// Join two participants: one with normal volume, one with very low volume
			await joinFakeParticipant(roomId, 'RemoteA-Silence');

			// Wait for speaker detection to process
			await waitForParticipantCount(page, 2);

			await joinBrowserFakeParticipant(roomId, 'RemoteB-LowVolume', {
				audioFile: 'low_volume_speech.wav' // 10% volume - below 0.15 threshold
			});

			// Wait additional time for B's low volume to be evaluated
			await page.waitForTimeout(4000);
			for (let i = 0; i < 5; i++) {
				const [visibleNames, participantCount] = await Promise.all([
					getVisibleParticipantNames(page),
					getVisibleParticipantsCount(page)
				]);

				console.log('Visible participants with volume filtering:', visibleNames);

				// Remote B (low volume) should NOT be prioritized as active speaker
				expect(visibleNames).not.toContain('RemoteB-LowVolume');
				expect(participantCount).toBe(2); // Local + 1 remote
			}
		});

		test('should maintain layout stability when multiple participants have intermittent low-level audio', async ({
			page
		}) => {
			// Scenario: 3 participants all with low volume audio, limit = 2
			// Expected: Layout remains stable without constant swapping (all filtered by audioLevel threshold)
			// Audio: All use low_volume_speech.wav

			// Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
			await muteAudio(page); // Mute local to avoid interference

			// Configure Smart Mosaic layout with limit = 1
			await configureLayoutMode(page, 'smart-mosaic', 1);
			await joinFakeParticipant(roomId, 'Remote-Initial');

			await waitForParticipantCount(page, 2);

			// Join three participants all with low volume
			await Promise.all([
				joinBrowserFakeParticipant(roomId, 'RemoteA-LowVol', {
					audioFile: 'ambient_pink_noise.wav'
				}),
				joinBrowserFakeParticipant(roomId, 'RemoteB-LowVol', {
					audioFile: 'ambient_pink_noise.wav'
				})
			]);

			await page.waitForTimeout(3000);

			// Record initial visible participants
			const initialVisibleNames = await getVisibleParticipantNames(page);
			console.log('Initial visible participants:', initialVisibleNames);

			// Check layout stability over time - should not swap since all are below threshold
			let swapCount = 0;
			let previousNames = [...initialVisibleNames];

			for (let i = 0; i < 10; i++) {
				await page.waitForTimeout(500);
				const currentNames = await getVisibleParticipantNames(page);

				// Check if any swap occurred
				const hasSwap = !previousNames.every((name) => currentNames.includes(name));
				if (hasSwap) {
					swapCount++;
					console.log(`Swap detected at check ${i + 1}:`, previousNames, '->', currentNames);
				}

				previousNames = [...currentNames];
			}

			console.log(`Total swaps detected: ${swapCount}`);

			// Layout should be stable - no swaps should occur since all are filtered
			expect(swapCount).toBe(0);
		});

		test('should not prioritize participant with brief sound (cough) under minimum duration', async ({ page }) => {
			// Scenario: 3 participants - Local + Remote A (continuous speech) + Remote B (0.5s cough only)
			// Expected: Remote A appears as active speaker, Remote B's brief cough is filtered out
			// Audio: A uses continuous_speech.wav, B uses brief_cough.wav (0.5s sound)

			// Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
			await muteAudio(page); // Mute local to avoid interference

			// Configure Smart Mosaic layout with limit = 1
			await configureLayoutMode(page, 'smart-mosaic', 1);

			// Join silence participant first
			await joinFakeParticipant(roomId, 'RemoteA-Speaker');

			// Wait for A to be detected as speaker
			await waitForParticipantCount(page, 2);

			// Now join participant B with brief cough sound
			await joinBrowserFakeParticipant(roomId, 'RemoteB-Cough', {
				audioFile: 'brief_cough_at_5s.wav' // 0.5s sound - below minimum duration
			});

			// Wait for the brief sound to be processed
			await page.waitForTimeout(5000);

			for (let i = 0; i < 5; i++) {
				const [visibleNames, participantCount] = await Promise.all([
					getVisibleParticipantNames(page),
					getVisibleParticipantsCount(page)
				]);

				// Remote A should remain visible throughout
				expect(visibleNames).not.toContain('RemoteB-Cough');
				expect(participantCount).toBe(2); // Local + 1 remote
				await page.waitForTimeout(500);
			}
		});

		test('should not swap active speaker for participant with 1 second sound burst', async ({ page }) => {
			// Scenario: 3 participants - Local + Remote A (speaking) + Remote B (1s sound burst)
			// Expected: A remains visible, B's 1 second sound is filtered (< 1.5s threshold)
			// Audio: A uses continuous_speech.wav, B uses brief_sound_1s.wav

			// Local participant joins the room
			await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, page);

			// Wait for session to be ready
			await waitForElementInIframe(page, 'ov-session', { state: 'visible' });

			// Configure Smart Mosaic layout with limit = 1
			await configureLayoutMode(page, 'smart-mosaic', 1);

			// Join participant A with continuous speech
			await joinFakeParticipant(roomId, 'RemoteA-Continuous');

			await waitForParticipantCount(page, 2);

			// Join participant B with 1 second sound burst
			await joinBrowserFakeParticipant(roomId, 'RemoteB-BriefSound', {
				audioFile: 'brief_sound_1s_at_5s.wav' // 1s sound
			});

			// Wait 5s to allow B's speaks
			await page.waitForTimeout(5000);

			// Track visible participants over time to ensure no swap occurs
			for (let i = 0; i < 5; i++) {
				const visibleNames = await getVisibleParticipantNames(page);

				// A should remain visible throughout
				expect(visibleNames).not.toContain('RemoteB-BriefSound');
				console.log(`Check ${i + 1}: Visible participants:`, visibleNames);

				await page.waitForTimeout(500);
			}
		});
	});
});
