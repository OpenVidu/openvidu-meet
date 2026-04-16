import { expect, test, type Browser, type Page } from '@playwright/test';
import { createRoom, createRoomAndGetAccessUrl, deleteRooms, type E2ERoom } from './helpers/meet-api.helper';
import {
    expectLocalStreamMediaCount,
    expectScreenShareCount,
    expectStreamCount,
    joinFromPrejoinWithMediaState,
    leaveMeeting,
    openMeeting,
    startScreensharing,
    stopScreensharing,
    toggleCamera,
    toggleMicrophone,
    waitForRemoteStream
} from './helpers/meeting-ui.helper';

/** Helper to track created rooms for cleanup */
function createRoomTracker() {
	const createdRoomIds = new Set<string>();

	return {
		async createRoom(roomName: string): Promise<E2ERoom> {
			const room = await createRoom({ roomName });
			createdRoomIds.add(room.roomId);
			return room;
		},

		async createAccessUrl(participantName: string, room?: E2ERoom): Promise<string> {
			const { room: createdRoom, accessUrl } = await createRoomAndGetAccessUrl(participantName, room);
			createdRoomIds.add(createdRoom.roomId);
			return accessUrl;
		},

		async cleanup(): Promise<void> {
			await deleteRooms(createdRoomIds);
		}
	};
}

test.describe('Stream rendering - Single participant scenarios', () => {
	test.describe.configure({ timeout: 120_000 });
	let tracker: ReturnType<typeof createRoomTracker>;

	test.beforeAll(() => {
		tracker = createRoomTracker();
	});

	test.afterAll(async () => {
		await tracker.cleanup();
	});

	test('should render video element when joining with video enabled', async ({ page }) => {
		const accessUrl = await tracker.createAccessUrl(`stream-ve-${Date.now()}`);
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: true, audioEnabled: true });
		await expectStreamCount(page, 1);
		await expectLocalStreamMediaCount(page, { video: 1, audio: 1 });
	});

	test('should keep local media elements rendered when joining with video disabled', async ({ page }) => {
		const accessUrl = await tracker.createAccessUrl(`stream-vd-${Date.now()}`);
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: false });
		await expectStreamCount(page, 1);
		await expectLocalStreamMediaCount(page, { video: 1, audio: 1 });
	});

	test('should keep local media elements rendered when joining with audio disabled', async ({ page }) => {
		const accessUrl = await tracker.createAccessUrl(`stream-ad-${Date.now()}`);
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: true, audioEnabled: false });
		await expectStreamCount(page, 1);
		await expectLocalStreamMediaCount(page, { video: 1, audio: 1 });
	});

	test('should toggle microphone off and on', async ({ page }) => {
		const accessUrl = await tracker.createAccessUrl(`stream-toggle-mic-${Date.now()}`);
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: true, audioEnabled: true });
		await expectLocalStreamMediaCount(page, { audio: 1 });

		// Toggle off
		await toggleMicrophone(page);
		await page.waitForTimeout(500);

		// Toggle back on
		await toggleMicrophone(page);
		await page.waitForTimeout(500);
		await expectLocalStreamMediaCount(page, { audio: 1 });
	});

	test('should add screen share when sharing with all media enabled', async ({ page }) => {
		const accessUrl = await tracker.createAccessUrl(`stream-share-full-${Date.now()}`);
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
		const accessUrl = await tracker.createAccessUrl(`stream-share-novideo-${Date.now()}`);
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
		const accessUrl = await tracker.createAccessUrl(`stream-share-noaudio-${Date.now()}`);
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
		const accessUrl = await tracker.createAccessUrl(`stream-share-nomedia-${Date.now()}`);
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
	test.describe.configure({ timeout: 120_000 });
	let tracker: ReturnType<typeof createRoomTracker>;

	test.beforeAll(() => {
		tracker = createRoomTracker();
	});

	test.afterAll(async () => {
		await tracker.cleanup();
	});

	async function openTwoParticipants(browser: Browser): Promise<{ pageA: Page; pageB: Page }> {
		const room = await tracker.createRoom(`streams-${Date.now()}`);
		const accessUrlA = await tracker.createAccessUrl(`stream-a-${Date.now()}`, room);
		const accessUrlB = await tracker.createAccessUrl(`stream-b-${Date.now()}`, room);

		const pageA = await browser.newPage();
		await openMeeting(pageA, accessUrlA);

		const pageB = await browser.newPage();
		await openMeeting(pageB, accessUrlB);

		await waitForRemoteStream(pageA);
		await waitForRemoteStream(pageB);

		return { pageA, pageB };
	}

	test('should render both participant streams', async ({ browser }) => {
		const { pageA, pageB } = await openTwoParticipants(browser);

		await expectStreamCount(pageA, 2);
		await expectStreamCount(pageB, 2);

		await pageB.close();
		await pageA.close();
	});

	test('should handle screen share from muted participant to other participant', async ({ browser }) => {
		const { pageA, pageB } = await openTwoParticipants(browser);

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

		await pageB.close();
		await pageA.close();
	});

	test('should handle screen share with full media enabled', async ({ browser }) => {
		const { pageA, pageB } = await openTwoParticipants(browser);

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

		await pageB.close();
		await pageA.close();
	});

	test('should sync remote participant media state changes', async ({ browser }) => {
		const { pageA, pageB } = await openTwoParticipants(browser);

		// Both have video and audio
		await expect(pageA.locator('.OV_stream.local .OV_video-element')).toHaveCount(1);
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

		await pageB.close();
		await pageA.close();
	});
});

test.describe('Stream rendering - Three or more participants', () => {
	test.describe.configure({ timeout: 120_000 });
	let tracker: ReturnType<typeof createRoomTracker>;

	test.beforeAll(() => {
		tracker = createRoomTracker();
	});

	test.afterAll(async () => {
		await tracker.cleanup();
	});

	test('should render three participant streams when three join', async ({ browser }) => {
		const room = await tracker.createRoom(`three-participants-${Date.now()}`);
		const urlA = await tracker.createAccessUrl(`three-a-${Date.now()}`, room);
		const urlB = await tracker.createAccessUrl(`three-b-${Date.now()}`, room);
		const urlC = await tracker.createAccessUrl(`three-c-${Date.now()}`, room);

		const pageA = await browser.newPage();
		await openMeeting(pageA, urlA);

		const pageB = await browser.newPage();
		await openMeeting(pageB, urlB);

		const pageC = await browser.newPage();
		await openMeeting(pageC, urlC);

		await waitForRemoteStream(pageA);
		await waitForRemoteStream(pageB);
		await waitForRemoteStream(pageC);

		// A sees: self + B + C
		await expect(pageA.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageA.locator('.OV_stream.local')).toHaveCount(2); // Audio and video streams
		// B sees: self + A + C
		await expect(pageB.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageB.locator('.OV_stream.local')).toHaveCount(2); // Audio and video streams
		// C sees: self + A + B
		await expect(pageC.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageC.locator('.OV_stream.local')).toHaveCount(2); // Audio and video streams

		await pageC.close();
		await pageB.close();
		await pageA.close();
	});

	test('should handle participant leaving and streams being removed', async ({ browser }) => {
		const room = await tracker.createRoom(`participant-leave-${Date.now()}`);
		const urlA = await tracker.createAccessUrl(`leave-a-${Date.now()}`, room);
		const urlB = await tracker.createAccessUrl(`leave-b-${Date.now()}`, room);
		const urlC = await tracker.createAccessUrl(`leave-c-${Date.now()}`, room);

		const pageA = await browser.newPage();
		await openMeeting(pageA, urlA);

		const pageB = await browser.newPage();
		await openMeeting(pageB, urlB);

		const pageC = await browser.newPage();
		await openMeeting(pageC, urlC);

		await Promise.all([waitForRemoteStream(pageA), waitForRemoteStream(pageB), waitForRemoteStream(pageC)]);
		// All see 3 streams
		await Promise.all([
			expect(pageA.locator('.OV_stream.remote')).toHaveCount(2),
			expect(pageA.locator('.OV_stream.local')).toHaveCount(2),
			expect(pageB.locator('.OV_stream.remote')).toHaveCount(2),
			expect(pageB.locator('.OV_stream.local')).toHaveCount(2),
			expect(pageC.locator('.OV_stream.remote')).toHaveCount(2),
			expect(pageC.locator('.OV_stream.local')).toHaveCount(2)
		]);

		// C leaves
		await leaveMeeting(pageC);
		await pageB.waitForTimeout(1000);

		// A now sees 2 streams (self + B)
		await expect(pageA.locator('.OV_stream.remote')).toHaveCount(1);
		// B now sees 2 streams (self + A)
		await expect(pageB.locator('.OV_stream.remote')).toHaveCount(1);

		await pageB.close();
		await pageA.close();
	});

	test('should maintain stream order after rapid joins/leaves', async ({ browser }) => {
		const room = await tracker.createRoom(`rapid-change-${Date.now()}`);
		const urlA = await tracker.createAccessUrl(`rapid-a-${Date.now()}`, room);
		const urlB = await tracker.createAccessUrl(`rapid-b-${Date.now()}`, room);
		const urlC = await tracker.createAccessUrl(`rapid-c-${Date.now()}`, room);

		const pageA = await browser.newPage();
		await openMeeting(pageA, urlA);

		const pageB = await browser.newPage();
		await openMeeting(pageB, urlB);

		await waitForRemoteStream(pageA);

		// A and B see each other
		await expect(pageA.locator('.OV_stream.remote')).toHaveCount(1);
		await expect(pageB.locator('.OV_stream.remote')).toHaveCount(1);

		// C joins
		const pageC = await browser.newPage();
		await openMeeting(pageC, urlC);

		await waitForRemoteStream(pageA);
		await waitForRemoteStream(pageB);

		// All three see 3 streams
		await expect(pageA.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageA.locator('.OV_stream.local')).toHaveCount(2);
		await expect(pageB.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageB.locator('.OV_stream.local')).toHaveCount(2);
		await expect(pageC.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageC.locator('.OV_stream.local')).toHaveCount(2);

		// B leaves and rejoins
		await leaveMeeting(pageB);
		await pageA.waitForTimeout(500);

		await expect(pageA.locator('.OV_stream.remote')).toHaveCount(1);
		await expect(pageA.locator('.OV_stream.local')).toHaveCount(2);

		const urlBNew = await tracker.createAccessUrl(`rapid-b-new-${Date.now()}`, room);
		await openMeeting(pageB, urlBNew);

		await waitForRemoteStream(pageA);

		// Back to 3 streams
		await expect(pageA.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageA.locator('.OV_stream.local')).toHaveCount(2);

		await Promise.all([pageB.close(), pageC.close(), pageA.close()]);
	});

	test('should handle rapid video/audio toggles from multiple participants', async ({ browser }) => {
		const room = await tracker.createRoom(`rapid-media-toggle-${Date.now()}`);
		const urlA = await tracker.createAccessUrl(`toggle-a-${Date.now()}`, room);
		const urlB = await tracker.createAccessUrl(`toggle-b-${Date.now()}`, room);

		const pageA = await browser.newPage();
		await openMeeting(pageA, urlA);

		const pageB = await browser.newPage();
		await openMeeting(pageB, urlB);

		await waitForRemoteStream(pageA);

		// Both have 2 streams with video
		await expect(pageA.locator('.OV_stream.local .OV_video-element')).toHaveCount(1);
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

		await pageB.close();
		await pageA.close();
	});
});
