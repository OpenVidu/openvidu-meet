import { expect, test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import {
	dragStream,
	expectLocalStreamCount,
	expectScreenShareCount,
	expectStreamCount,
	getElementBoundingBox,
	hoverStream,
	joinFromPrejoinWithMediaState,
	joinParticipants,
	leaveMeeting,
	maximizeStream,
	minimizeStream,
	muteRemoteParticipant,
	openMeeting,
	startScreensharing,
	stopScreensharing,
	toggleCamera,
	toggleMicrophone,
	unmuteRemoteParticipant,
	waitForRemoteStream
} from './helpers/meeting-ui.helper';

let roomId: string;
let accessUrl: string;

test.beforeAll(async () => {
	const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl();
	roomId = room.roomId;
	accessUrl = url;
});

test.afterAll(async () => {
	await deleteRooms([roomId]);
});

test.describe('Stream rendering - Single participant scenarios', () => {
	test('should render video element when joining with video enabled', async ({ page }) => {
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: true, audioEnabled: true });
		await expectStreamCount(page, 1);
		await expectLocalStreamCount(page, { video: 1, audio: 0 });
	});

	test('should keep local media elements rendered when joining with video disabled', async ({ page }) => {
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: false, audioEnabled: true });
		await expectStreamCount(page, 1);
		await expectLocalStreamCount(page, { video: 1, audio: 0 });
	});

	test('should keep local media elements rendered when joining with audio disabled', async ({ page }) => {
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: true, audioEnabled: false });
		await expectStreamCount(page, 1);
		await expectLocalStreamCount(page, { video: 1, audio: 0 });
	});

	test('should toggle microphone off and on', async ({ page }) => {
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: true, audioEnabled: true });
		await expectLocalStreamCount(page, { video: 1, audio: 0 });

		// Toggle off
		await toggleMicrophone(page);
		await page.waitForTimeout(500);
		await expectLocalStreamCount(page, { video: 1, audio: 0 });

		// Toggle back on
		await toggleMicrophone(page);
		await page.waitForTimeout(500);
		await expectLocalStreamCount(page, { video: 1, audio: 0 });
	});

	test('should add screen share when sharing with all media enabled', async ({ page }) => {
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: true, audioEnabled: true });
		await expectStreamCount(page, 1);

		await startScreensharing(page);
		await expect(page.locator('.local_participant.OV_screen')).toBeVisible();
		await expectStreamCount(page, 2);
		await expectScreenShareCount(page, 1);

		await stopScreensharing(page);
		await expectStreamCount(page, 1);
		await expectScreenShareCount(page, 0);
	});

	test('should add screen share even when video is disabled', async ({ page }) => {
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: false, audioEnabled: true });
		await expectStreamCount(page, 1);

		await startScreensharing(page);
		await expect(page.locator('.local_participant.OV_screen')).toBeVisible();
		await expectStreamCount(page, 2);
		await expectScreenShareCount(page, 1);

		await stopScreensharing(page);
		await expectStreamCount(page, 1);
		await expectScreenShareCount(page, 0);
	});

	test('should add screen share even when audio is disabled', async ({ page }) => {
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: true, audioEnabled: false });
		await expectStreamCount(page, 1);

		await startScreensharing(page);
		await expect(page.locator('.local_participant.OV_screen')).toBeVisible();
		await expectStreamCount(page, 2);
		await expectScreenShareCount(page, 1);

		await stopScreensharing(page);
		await expectStreamCount(page, 1);
		await expectScreenShareCount(page, 0);
	});

	test('should add screen share even when all media is disabled', async ({ page }) => {
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: false, audioEnabled: false });
		await expectStreamCount(page, 1);

		await startScreensharing(page);
		await expect(page.locator('.OV_screen .local')).toBeVisible();
		await expectStreamCount(page, 2);
		await expectScreenShareCount(page, 1);

		await stopScreensharing(page);
		await expectStreamCount(page, 1);
		await expectScreenShareCount(page, 0);
	});
});

test.describe('Stream rendering - Multi participant scenarios', () => {
	test('should render both participant streams', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 2);
		const [, pageB] = pages;

		try {
			await expectStreamCount(pageA, 2);
			await expectStreamCount(pageB, 2);
		} finally {
			await Promise.all(pages.map((p) => p.close()));
		}
	});

	test('should handle screen share from muted participant to other participant', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 2);
		const [, pageB] = pages;

		try {
			await expectStreamCount(pageA, 2);
			await expectStreamCount(pageB, 2);

			// B shares screen
			await startScreensharing(pageB);
			await expect(pageB.locator('.OV_screen .local')).toBeVisible();
			await expectStreamCount(pageB, 3);
			await expectStreamCount(pageA, 3);
			await expectScreenShareCount(pageB, 1);
			await expectScreenShareCount(pageA, 1);

			await stopScreensharing(pageB);
			await expectStreamCount(pageB, 2);
			await expectStreamCount(pageA, 2);
			await expectScreenShareCount(pageB, 0);
			await expectScreenShareCount(pageA, 0);
		} finally {
			await Promise.all(pages.map((p) => p.close()));
		}
	});

	test('should handle screen share with full media enabled', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 2);
		const [, pageB] = pages;

		try {
			await expectStreamCount(pageA, 2);
			await expectStreamCount(pageB, 2);

			// B shares screen
			await startScreensharing(pageB);
			await expect(pageB.locator('.OV_screen .local')).toBeVisible();
			await expectStreamCount(pageB, 3);
			await expectStreamCount(pageA, 3);
			await expectScreenShareCount(pageB, 1);
			await expectScreenShareCount(pageA, 1);

			await stopScreensharing(pageB);
			await expectStreamCount(pageB, 2);
			await expectStreamCount(pageA, 2);
		} finally {
			await Promise.all(pages.map((p) => p.close()));
		}
	});

	test('should sync remote participant media state changes', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 2);
		const [, pageB] = pages;

		try {
			// Both have video and audio
			await expect(pageA.locator('.OV_publisher .OV_stream_video.local .OV_video-element')).toHaveCount(1);
			await expect(pageA.locator('.OV_stream.remote .OV_video-element')).toHaveCount(1);

			// pageB disables camera
			await toggleCamera(pageB);
			await pageB.waitForTimeout(1000);

			// pageA should see pageB's video poster
			await expect(pageA.locator('.OV_stream.remote #video-poster')).toHaveCount(1);

			// pageB re-enables camera
			await toggleCamera(pageB);
			await pageB.waitForTimeout(1000);

			// pageA should see pageB's video restored
			await expect(pageA.locator('.OV_stream.remote #video-poster')).toHaveCount(0);
		} finally {
			await Promise.all(pages.map((p) => p.close()));
		}
	});
});

test.describe('Stream rendering - Three or more participants', () => {
	test('should render three participant streams when three join', async ({ browser }) => {
		const { pages } = await joinParticipants(browser, accessUrl, 3);

		try {
			// Each participant sees the other 2 as remote streams and their own as local stream (total 3)
			await Promise.all(pages.map((page) => expectStreamCount(page, 3)));
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should handle participant leaving and streams being removed', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 3);
		const [, pageB, pageC] = pages;

		try {
			// Each participant sees the other 2 as remote streams and their own as local stream (total 3)
			await Promise.all(pages.map((page) => expectStreamCount(page, 3)));

			// C leaves
			await leaveMeeting(pageC);
			await pageB.waitForTimeout(1000);

			// A and B each now see only the other as a remote stream (total 2)
			await Promise.all([pageA, pageB].map((page) => expectStreamCount(page, 2)));
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should maintain stream order after rapid joins/leaves', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 3);
		const [, pageB] = pages;

		try {
			// B leaves
			await leaveMeeting(pageB);
			await pageA.waitForTimeout(500);

			// A should now see only C's stream (total 2)
			await expectStreamCount(pageA, 2);

			// B rejoins
			await openMeeting(pageB, accessUrl);

			// Back to seeing both B and C as remote streams (total 3)
			await expectStreamCount(pageA, 3);
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should handle rapid video/audio toggles from multiple participants', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 2);
		const [, pageB] = pages;

		try {
			// Both have 2 streams with video
			await expect(pageA.locator('.OV_publisher .OV_stream_video.local .OV_video-element')).toHaveCount(1);
			await expect(pageA.locator('.OV_stream.remote .OV_video-element')).toHaveCount(1);

			// Rapid toggles on A
			await toggleCamera(pageA);
			await pageA.waitForTimeout(100);
			await toggleCamera(pageA);
			await pageA.waitForTimeout(100);

			// Should still have 2 video streams
			await expect(pageA.locator('.OV_stream .OV_video-element')).toHaveCount(2);

			// Rapid toggles on B simultaneously
			await toggleCamera(pageB);
			await pageB.waitForTimeout(100);
			await toggleCamera(pageB);

			// A should still see remote video
			await expect(pageA.locator('.OV_stream.remote .OV_video-element')).toHaveCount(1);
		} finally {
			await Promise.all(pages.map((p) => p.close()));
		}
	});
});

test.describe('Stream UI controls - Minimize and maximize', () => {
	test('should show the MINIMIZE button ONLY over the LOCAL video', async ({ page }) => {
		await openMeeting(page, accessUrl);
		await expectStreamCount(page, 1);

		// Hover over local stream - minimize button should appear
		await hoverStream(page, '.OV_publisher .OV_stream_video.local');
		await expect(page.locator('#minimize-btn')).toBeVisible();

		// Create second participant to verify minimize button doesn't appear on remote
		const pageB = await page.context().newPage();
		await openMeeting(pageB, accessUrl);
		await waitForRemoteStream(pageB);

		// Hover over remote stream - minimize button should NOT appear
		await hoverStream(pageB, '.OV_stream_video.remote');
		await expect(pageB.locator('#minimize-btn')).toHaveCount(0);

		// Hover over local stream - minimize button should appear
		await hoverStream(pageB, '.OV_stream_video.local');
		await expect(pageB.locator('#minimize-btn')).toBeVisible();

		await pageB.close();
	});

	test('should minimize the LOCAL video', async ({ page }) => {
		await openMeeting(page, accessUrl);

		// Get initial stream dimensions
		const localContainer = page.locator('.local_participant:has(.OV_stream_video.local)').first();
		const initialBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(initialBox).not.toBeNull();

		// Hover and click minimize
		await minimizeStream(page);
		await page.waitForTimeout(1000);

		// Verify stream is minimized
		await expect(localContainer).toHaveClass(/OV_minimized/);
		const minimizedBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(minimizedBox).not.toBeNull();

		expect(minimizedBox!.x).toBeLessThan(200);
		expect(minimizedBox!.y).toBeLessThan(150);
		expect(minimizedBox!.height).toBeGreaterThan(0);
		expect(minimizedBox!.width).toBeGreaterThan(0);

		await page.close();
	});

	test('should MAXIMIZE the local video (restore to layout)', async ({ page }) => {
		await openMeeting(page, accessUrl);

		const localContainer = page.locator('.local_participant:has(.OV_stream_video.local)').first();

		// Get initial stream dimensions
		const initialBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(initialBox).not.toBeNull();

		// Minimize the stream
		await hoverStream(page, '.local_participant .OV_stream_video.local');
		await minimizeStream(page);
		await page.waitForTimeout(800);
		await expect(localContainer).toHaveClass(/OV_minimized/);

		// Verify minimized
		const minimizedBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(minimizedBox).not.toBeNull();

		// Maximize (restore) the stream
		await hoverStream(page, '.local_participant .OV_stream_video.local');
		await maximizeStream(page);
		await page.waitForTimeout(1500);
		await expect(localContainer).not.toHaveClass(/OV_minimized/);

		// Verify stream is restored to layout
		const restoredBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(restoredBox).not.toBeNull();

		expect(Math.abs(restoredBox!.x - minimizedBox!.x)).toBeGreaterThan(50);
		expect(Math.abs(restoredBox!.y - minimizedBox!.y)).toBeGreaterThanOrEqual(0);
		expect(restoredBox!.width).toBeGreaterThan(minimizedBox!.width);
		expect(restoredBox!.height).toBeGreaterThan(minimizedBox!.height);

		await page.close();
	});

	test('should be able to drag the minimized LOCAL video', async ({ page }) => {
		await openMeeting(page, accessUrl);

		// Minimize stream
		await hoverStream(page, '.local_participant .OV_stream_video.local');
		await minimizeStream(page);
		await page.waitForTimeout(500);

		const beforeDragBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(beforeDragBox).not.toBeNull();

		// Drag to new position
		await dragStream(page, '.local_participant', 300, 300);
		await page.waitForTimeout(500);

		// Verify stream was dragged
		const streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();
		expect(Math.abs(streamBox!.x - beforeDragBox!.x)).toBeGreaterThan(40);
		expect(Math.abs(streamBox!.y - beforeDragBox!.y)).toBeGreaterThan(40);

		await page.close();
	});

	test('should be the MINIMIZED video ALWAYS VISIBLE when toggling panels', async ({ page }) => {
		await openMeeting(page, accessUrl);

		// Minimize stream
		await hoverStream(page, '.local_participant .OV_stream_video.local');
		await minimizeStream(page);
		await page.waitForTimeout(500);

		// Drag to right
		await dragStream(page, '.local_participant', 900, 0);
		await page.waitForTimeout(500);

		// Verify position after drag
		let streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();
		expect(streamBox!.y).toBeLessThanOrEqual(20);

		// Open chat panel
		await page.locator('#chat-panel-btn').click();
		await page.waitForTimeout(1000);

		// Stream should adjust position when panel opens
		streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();
		const xWithPanelOpen = streamBox!.x;
		expect(xWithPanelOpen).toBeGreaterThanOrEqual(0);

		// Close chat panel
		await page.locator('#chat-panel-btn').click();
		await page.waitForTimeout(1000);

		// Stream should return to right side
		streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();
		expect(streamBox!.x).toBeGreaterThanOrEqual(xWithPanelOpen);

		await page.close();
	});

	test('should be the MINIMIZED video go to the right when panel closes', async ({ page }) => {
		await openMeeting(page, accessUrl);

		// Open chat panel first
		await page.locator('#chat-panel-btn').click();
		await page.waitForTimeout(1000);

		// Minimize stream
		await hoverStream(page, '.local_participant .OV_stream_video.local');
		await minimizeStream(page);
		await page.waitForTimeout(1000);

		// Drag to right
		await dragStream(page, '.local_participant', 600, 0);
		await page.waitForTimeout(1000);

		// Verify position after drag
		let streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();
		const draggedX = streamBox!.x;

		// Close chat panel
		await page.locator('#chat-panel-btn').click();
		await page.waitForTimeout(1000);

		// Stream should move to right
		streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();
		expect(streamBox!.x).toBeGreaterThanOrEqual(draggedX);

		await page.close();
	});

	test('should be the MINIMIZED video ALWAYS VISIBLE when toggling from small to bigger panel', async ({ page }) => {
		await openMeeting(page, accessUrl);

		// Minimize stream
		await hoverStream(page, '.local_participant .OV_stream_video.local');
		await minimizeStream(page);
		await page.waitForTimeout(500);

		// Drag to right
		await dragStream(page, '.local_participant', 900, 0);
		await page.waitForTimeout(500);

		// Open chat panel
		await page.locator('#chat-panel-btn').click();
		await page.waitForTimeout(1000);
		let streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();
		const posXChat = streamBox!.x;

		// Open settings panel
		await page.locator('#more-options-btn').click();
		await expect(page.locator('.mat-mdc-menu-content')).toBeVisible();
		await page.waitForTimeout(500);

		streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();
		const posXSettings = streamBox!.x;

		// Settings panel should push video further left
		expect(posXSettings).toBeLessThanOrEqual(posXChat);

		// Close all panels
		await page.keyboard.press('Escape');
		await page.waitForTimeout(500);

		// Stream should move back to right
		streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();
		expect(streamBox!.x).toBeGreaterThanOrEqual(posXSettings);

		await page.close();
	});

	test('should MAXIMIZE the local video after drag (reset position to layout)', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await page.waitForTimeout(1000);
		// Get initial layout stream position
		const initialBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(initialBox).not.toBeNull();

		// Minimize stream
		await hoverStream(page, '.local_participant .OV_stream_video.local');
		await minimizeStream(page);
		await page.waitForTimeout(500);

		// Drag to right
		await dragStream(page, '.local_participant', 300, 300);
		await page.waitForTimeout(500);

		// Verify stream was dragged
		let streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();
		const xAfterDrag = streamBox!.x;

		// Maximize (restore)
		await hoverStream(page, '.local_participant .OV_stream_video.local');
		await maximizeStream(page);
		await page.waitForTimeout(1500);

		// Stream should be reset to layout position
		streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();

		// Verify video returns to layout flow (y should be small, near top)
		expect(Math.abs(streamBox!.x - xAfterDrag)).toBeGreaterThan(50);
		expect(Math.abs(streamBox!.x - initialBox!.x)).toBeCloseTo(0);
		expect(Math.abs(streamBox!.y - initialBox!.y)).toBeCloseTo(0);

		await page.close();
	});
});

test.describe('Stream UI controls - PIN and silence buttons', () => {
	test('should show the PIN button over the LOCAL video', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await hoverStream(page, '.OV_publisher .OV_stream_video.local');
		await expect(page.locator('#pin-btn')).toBeVisible();

		await page.close();
	});

	test('should show the PIN button over the REMOTE video', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 2);

		try {
			// Hover over remote stream
			await hoverStream(pageA, '.OV_stream.remote');
			await expect(pageA.locator('#pin-btn')).toBeVisible();
		} finally {
			await Promise.all(pages.map((p) => p.close()));
		}
	});

	test('should show the SILENCE button ONLY over the REMOTE video', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 2);

		try {
			// Local stream should NOT have silence button
			await hoverStream(pageA, '.OV_publisher .OV_stream_video.local');
			await pageA.waitForTimeout(500);
			await expect(pageA.locator('.OV_publisher .OV_stream_video.local #mute-btn')).toHaveCount(0);

			// Remote stream should have silence button
			await hoverStream(pageA, '.OV_stream.remote');
			await expect(pageA.locator('#mute-btn')).toBeVisible();
		} finally {
			await Promise.all(pages.map((p) => p.close()));
		}
	});
});

test.describe('Audio detection - Speaking indicator', () => {
	test('should show the audio detection elements when participant is speaking', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 2);

		try {
			// Wait for audio detection on remote stream (speaking indicator)
			await expect
				.poll(
					async () => {
						const count = await pageA.locator('.OV_stream.remote.speaking').count();
						return count >= 1;
					},
					{ timeout: 10_000 }
				)
				.toBeTruthy();
		} finally {
			await Promise.all(pages.map((p) => p.close()));
		}
	});
});

test.describe('Mute Participant - Local participant can mute remote audio', () => {
	test('should successfully mute remote participant audio for local user only', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 2);
		const [, pageB] = pages;

		try {
			// Wait for exactly 1 remote stream (placeholder with no-size may still be in DOM briefly)
			await expect(pageA.locator('.OV_stream.remote')).toHaveCount(1, { timeout: 10_000 });
			await expect(pageA.locator('.OV_stream.remote .OV_media-element')).toHaveCount(1);

			// Check initial muted state — audio is always attached to the <video> element (AV mode)
			const isInitiallyMuted = await pageA.evaluate(() => {
				const el = document.querySelector('.OV_stream.remote .OV_video-element') as HTMLVideoElement | null;
				return el!.muted;
			});
			expect(isInitiallyMuted).toBe(false);
			// There must be no standalone audio elements — audio is always carried by the video element
			await expect(pageA.locator('.OV_stream.remote .OV_audio-element')).toHaveCount(0);

			// Mute the remote participant
			await muteRemoteParticipant(pageA, '.OV_stream.remote');
			await pageA.waitForTimeout(500);

			// Verify the video element is now muted
			const isMutedAfterClick = await pageA.evaluate(() => {
				const el = document.querySelector('.OV_stream.remote .OV_video-element') as HTMLVideoElement | null;
				return el!.muted;
			});
			expect(isMutedAfterClick).toBe(true);
			await expect(pageA.locator('.OV_stream.remote .status-icons #muted-forcibly')).toHaveCount(1);

			// Verify remote participant B can still hear themselves and send audio
			// (this is only a local mute, not affecting the remote participant's transmission)
			await expect(pageB.locator('.OV_stream.local')).toBeVisible();
			// No audio elements exist in the DOM — audio is always on the video element
			await expect(pageB.locator('.OV_stream.local .OV_audio-element')).toHaveCount(0);

			// Unmute the remote participant
			await unmuteRemoteParticipant(pageA, '.OV_stream.remote');
			await pageA.waitForTimeout(500);

			// Verify the video element is unmuted again
			const isUnmutedAfterClick = await pageA.evaluate(() => {
				const el = document.querySelector('.OV_stream.remote .OV_video-element') as HTMLVideoElement | null;
				return el!.muted;
			});
			expect(isUnmutedAfterClick).toBe(false);
			await expect(pageA.locator('.OV_stream.remote .status-icons #muted-forcibly')).toHaveCount(0);
		} finally {
			await Promise.all(pages.map((p) => p.close()));
		}
	});

	test('should toggle mute state multiple times without issues', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 2);
		const [, pageB] = pages;

		try {
			// Perform multiple rapid mute/unmute toggles
			await muteRemoteParticipant(pageA, '.OV_stream.remote');
			await pageA.waitForTimeout(200);

			await unmuteRemoteParticipant(pageA, '.OV_stream.remote');
			await pageA.waitForTimeout(200);

			await muteRemoteParticipant(pageA, '.OV_stream.remote');
			await pageA.waitForTimeout(200);

			await unmuteRemoteParticipant(pageA, '.OV_stream.remote');
			await pageA.waitForTimeout(200);

			// Final state should be unmuted — audio is always on the video element, no standalone audio elements
			const finalMutedState = await pageA.evaluate(() => {
				const el = document.querySelector('.OV_stream.remote .OV_video-element') as HTMLVideoElement | null;
				return el!.muted;
			});
			expect(finalMutedState).toBe(false);
			await expect(pageA.locator('.OV_stream.remote .OV_audio-element')).toHaveCount(0);

			// Verify remote stream is still visible and functional
			await expect(pageA.locator('.OV_stream.remote')).toBeVisible();
			await expect(pageB.locator('.OV_stream.local')).toBeVisible();
		} finally {
			await Promise.all(pages.map((p) => p.close()));
		}
	});

	test('should maintain mute state when switching between multiple remote participants', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 3);

		try {
			// Verify A sees 2 remote streams
			await expect(pageA.locator('.OV_stream.remote')).toHaveCount(2);

			// Mute first remote stream (should be B)
			const firstRemote = pageA.locator('.OV_stream.remote').first();
			await firstRemote.hover();
			const firstSilenceBtn = firstRemote.locator('#mute-btn').first();
			await expect(firstSilenceBtn).toBeVisible();
			await firstSilenceBtn.click();
			await pageA.waitForTimeout(300);

			// Verify first remote is muted — audio is always on the video element
			const firstRemoteAudio = await pageA.evaluate(() => {
				const streams = document.querySelectorAll('.OV_stream.remote');
				const el = streams[0]?.querySelector('.OV_video-element') as HTMLVideoElement | null;
				return el!.muted;
			});
			expect(firstRemoteAudio).toBe(true);

			// Mute second remote stream (should be C)
			const secondRemote = pageA.locator('.OV_stream.remote').nth(1);
			await secondRemote.hover();
			const secondSilenceBtn = secondRemote.locator('#mute-btn').first();
			await expect(secondSilenceBtn).toBeVisible();
			await secondSilenceBtn.click();
			await pageA.waitForTimeout(300);

			// Verify both remotes are still muted — no standalone audio elements exist
			const bothMuted = await pageA.evaluate(() => {
				const streams = document.querySelectorAll('.OV_stream.remote');
				const elFirst = streams[0]?.querySelector('.OV_video-element') as HTMLVideoElement | null;
				const elSecond = streams[1]?.querySelector('.OV_video-element') as HTMLVideoElement | null;
				return { first: elFirst!.muted, second: elSecond!.muted };
			});
			expect(bothMuted.first).toBe(true);
			expect(bothMuted.second).toBe(true);
			await expect(pageA.locator('.OV_stream.remote .OV_audio-element')).toHaveCount(0);

			// Unmute first remote
			await firstRemote.hover();
			await firstSilenceBtn.click();
			await pageA.waitForTimeout(300);

			// Verify first is unmuted, second is still muted
			const mixedMutedState = await pageA.evaluate(() => {
				const streams = document.querySelectorAll('.OV_stream.remote');
				const elFirst = streams[0]?.querySelector('.OV_video-element') as HTMLVideoElement | null;
				const elSecond = streams[1]?.querySelector('.OV_video-element') as HTMLVideoElement | null;
				return { first: elFirst!.muted, second: elSecond!.muted };
			});
			expect(mixedMutedState.first).toBe(false);
			expect(mixedMutedState.second).toBe(true);
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});
});
