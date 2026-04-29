import { expect, test, type Browser, type Page } from '@playwright/test';
import {
	createRoom,
	createRoomAndGetAccessUrl,
	createRoomMember,
	deleteRooms,
	toAbsoluteMeetUrl
} from './helpers/meet-api.helper';
import {
	dragStream,
	expectLocalStreamMediaCount,
	expectScreenShareCount,
	expectStreamCount,
	getElementBoundingBox,
	hoverStream,
	joinFromPrejoinWithMediaState,
	leaveMeeting,
	maximizeStream,
	minimizeStream,
	openMeeting,
	startScreensharing,
	stopScreensharing,
	toggleCamera,
	toggleMicrophone,
	waitForRemoteStream
} from './helpers/meeting-ui.helper';

test.describe('Stream rendering - Single participant scenarios', () => {
	test.describe.configure({ timeout: 120_000 });
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should render video element when joining with video enabled', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `stream-ve-${Date.now()}`, createdRoomIds });
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: true, audioEnabled: true });
		await expectStreamCount(page, 1);
		await expectLocalStreamMediaCount(page, { video: 1, audio: 1 });
	});

	test('should keep local media elements rendered when joining with video disabled', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `stream-vd-${Date.now()}`, createdRoomIds });
		await joinFromPrejoinWithMediaState(page, accessUrl, { videoEnabled: false });
		await expectStreamCount(page, 1);
		await expectLocalStreamMediaCount(page, { video: 1, audio: 1 });
	});

	test('should keep local media elements rendered when joining with audio disabled', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `stream-ad-${Date.now()}`, createdRoomIds });
		await openMeeting(page, `${accessUrl}&audioEnabled=false`);
		await expectStreamCount(page, 1);
		await expectLocalStreamMediaCount(page, { video: 1, audio: 1 });
	});

	test('should toggle microphone off and on', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `stream-toggle-mic-${Date.now()}`, createdRoomIds });
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
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `stream-share-full-${Date.now()}`, createdRoomIds });
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
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `stream-share-novideo-${Date.now()}`, createdRoomIds });
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
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `stream-share-noaudio-${Date.now()}`, createdRoomIds });
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
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `stream-share-nomedia-${Date.now()}`, createdRoomIds });
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
	test.describe.configure({ timeout: 30_000 });
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	async function openTwoParticipants(browser: Browser): Promise<{ pageA: Page; pageB: Page }> {
		const room = await createRoom({ roomName: `streams-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const memberA = await createRoomMember({ roomId: room.roomId, name: `stream-a-${Date.now()}`, baseRole: 'moderator' });
		const memberB = await createRoomMember({ roomId: room.roomId, name: `stream-b-${Date.now()}`, baseRole: 'moderator' });
		const accessUrlA = toAbsoluteMeetUrl(memberA.accessUrl);
		const accessUrlB = toAbsoluteMeetUrl(memberB.accessUrl);

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

		await pageB.close();
		await pageA.close();
	});
});

test.describe('Stream rendering - Three or more participants', () => {
	test.describe.configure({ timeout: 30_000 });
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should render three participant streams when three join', async ({ browser }) => {
		const room = await createRoom({ roomName: `three-participants-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const memberA = await createRoomMember({ roomId: room.roomId, name: `three-a-${Date.now()}`, baseRole: 'moderator' });
		const memberB = await createRoomMember({ roomId: room.roomId, name: `three-b-${Date.now()}`, baseRole: 'moderator' });
		const memberC = await createRoomMember({ roomId: room.roomId, name: `three-c-${Date.now()}`, baseRole: 'moderator' });
		const urlA = toAbsoluteMeetUrl(memberA.accessUrl);
		const urlB = toAbsoluteMeetUrl(memberB.accessUrl);
		const urlC = toAbsoluteMeetUrl(memberC.accessUrl);

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
		await expect(pageA.locator('.OV_publisher .OV_stream_video.local')).toHaveCount(1); // Local camera stream
		// B sees: self + A + C
		await expect(pageB.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageB.locator('.OV_publisher .OV_stream_video.local')).toHaveCount(1); // Local camera stream
		// C sees: self + A + B
		await expect(pageC.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageC.locator('.OV_publisher .OV_stream_video.local')).toHaveCount(1); // Local camera stream

		await pageC.close();
		await pageB.close();
		await pageA.close();
	});

	test('should handle participant leaving and streams being removed', async ({ browser }) => {
		const room = await createRoom({ roomName: `participant-leave-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const memberA = await createRoomMember({ roomId: room.roomId, name: `leave-a-${Date.now()}`, baseRole: 'moderator' });
		const memberB = await createRoomMember({ roomId: room.roomId, name: `leave-b-${Date.now()}`, baseRole: 'moderator' });
		const memberC = await createRoomMember({ roomId: room.roomId, name: `leave-c-${Date.now()}`, baseRole: 'moderator' });
		const urlA = toAbsoluteMeetUrl(memberA.accessUrl);
		const urlB = toAbsoluteMeetUrl(memberB.accessUrl);
		const urlC = toAbsoluteMeetUrl(memberC.accessUrl);

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
			expect(pageA.locator('.OV_publisher .OV_stream_video.local')).toHaveCount(1),
			expect(pageB.locator('.OV_stream.remote')).toHaveCount(2),
			expect(pageB.locator('.OV_publisher .OV_stream_video.local')).toHaveCount(1),
			expect(pageC.locator('.OV_stream.remote')).toHaveCount(2),
			expect(pageC.locator('.OV_publisher .OV_stream_video.local')).toHaveCount(1)
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
		const room = await createRoom({ roomName: `rapid-change-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const memberA = await createRoomMember({ roomId: room.roomId, name: `rapid-a-${Date.now()}`, baseRole: 'moderator' });
		const memberB = await createRoomMember({ roomId: room.roomId, name: `rapid-b-${Date.now()}`, baseRole: 'moderator' });
		const memberC = await createRoomMember({ roomId: room.roomId, name: `rapid-c-${Date.now()}`, baseRole: 'moderator' });
		const urlA = toAbsoluteMeetUrl(memberA.accessUrl);
		const urlB = toAbsoluteMeetUrl(memberB.accessUrl);
		const urlC = toAbsoluteMeetUrl(memberC.accessUrl);

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
		await expect(pageA.locator('.OV_publisher .OV_stream_video.local')).toHaveCount(1);
		await expect(pageB.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageB.locator('.OV_publisher .OV_stream_video.local')).toHaveCount(1);
		await expect(pageC.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageC.locator('.OV_publisher .OV_stream_video.local')).toHaveCount(1);

		// B leaves and rejoins
		await leaveMeeting(pageB);
		await pageA.waitForTimeout(500);

		await expect(pageA.locator('.OV_stream.remote')).toHaveCount(1);
		await expect(pageA.locator('.OV_publisher .OV_stream_video.local')).toHaveCount(1);

		const memberBNew = await createRoomMember({ roomId: room.roomId, name: `rapid-b-new-${Date.now()}`, baseRole: 'moderator' });
		const urlBNew = toAbsoluteMeetUrl(memberBNew.accessUrl);
		await openMeeting(pageB, urlBNew);

		await waitForRemoteStream(pageA);

		// Back to 3 streams
		await expect(pageA.locator('.OV_stream.remote')).toHaveCount(2);
		await expect(pageA.locator('.OV_publisher .OV_stream_video.local')).toHaveCount(1);

		await Promise.all([pageB.close(), pageC.close(), pageA.close()]);
	});

	test('should handle rapid video/audio toggles from multiple participants', async ({ browser }) => {
		const room = await createRoom({ roomName: `rapid-media-toggle-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const memberA = await createRoomMember({ roomId: room.roomId, name: `toggle-a-${Date.now()}`, baseRole: 'moderator' });
		const memberB = await createRoomMember({ roomId: room.roomId, name: `toggle-b-${Date.now()}`, baseRole: 'moderator' });
		const urlA = toAbsoluteMeetUrl(memberA.accessUrl);
		const urlB = toAbsoluteMeetUrl(memberB.accessUrl);

		const pageA = await browser.newPage();
		await openMeeting(pageA, urlA);

		const pageB = await browser.newPage();
		await openMeeting(pageB, urlB);

		await waitForRemoteStream(pageA);

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

		await pageB.close();
		await pageA.close();
	});
});

test.describe('Stream UI controls - Minimize and maximize', () => {
	test.describe.configure({ timeout: 30_000 });
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should show the MINIMIZE button ONLY over the LOCAL video', async ({ page }) => {
		const room = await createRoom({ roomName: `minimize-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const memberA = await createRoomMember({ roomId: room.roomId, name: `min-local-${Date.now()}`, baseRole: 'moderator' });
		const memberB = await createRoomMember({ roomId: room.roomId, name: `min-remote-${Date.now()}`, baseRole: 'moderator' });
		const accessUrl = toAbsoluteMeetUrl(memberA.accessUrl);
		const urlB = toAbsoluteMeetUrl(memberB.accessUrl);
		await openMeeting(page, accessUrl);
		await expectStreamCount(page, 1);

		// Hover over local stream - minimize button should appear
		await hoverStream(page, '.OV_publisher .OV_stream_video.local');
		await expect(page.locator('#minimize-btn')).toBeVisible();

		// Create second participant to verify minimize button doesn't appear on remote

		const pageB = await page.context().newPage();
		await openMeeting(pageB, urlB);

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
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `minimize-${Date.now()}`, createdRoomIds });
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
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `maximize-${Date.now()}`, createdRoomIds });
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
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `drag-minimized-${Date.now()}`, createdRoomIds });
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
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `panel-toggle-${Date.now()}`, createdRoomIds });
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
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `panel-close-${Date.now()}`, createdRoomIds });
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
		await page.locator('#chat-panel-btn').click();
		await page.waitForTimeout(1000);

		// Stream should move to right
		streamBox = await getElementBoundingBox(page, '.local_participant .OV_stream_video.local');
		expect(streamBox).not.toBeNull();
		expect(streamBox!.x).toBeGreaterThanOrEqual(draggedX);

		await page.close();
	});

	test('should be the MINIMIZED video ALWAYS VISIBLE when toggling from small to bigger panel', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `panel-change-${Date.now()}`, createdRoomIds });
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
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `max-after-drag-${Date.now()}`, createdRoomIds });
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
	test.describe.configure({ timeout: 30_000 });
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should show the PIN button over the LOCAL video', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `pin-local-${Date.now()}`, createdRoomIds });
		await openMeeting(page, accessUrl);

		await hoverStream(page, '.OV_publisher .OV_stream_video.local');
		await expect(page.locator('#pin-btn')).toBeVisible();

		await page.close();
	});

	test('should show the PIN button over the REMOTE video', async ({ browser }) => {
		const room = await createRoom({ roomName: `pin-remote-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const memberA = await createRoomMember({ roomId: room.roomId, name: `pin-a-${Date.now()}`, baseRole: 'moderator' });
		const memberB = await createRoomMember({ roomId: room.roomId, name: `pin-b-${Date.now()}`, baseRole: 'moderator' });
		const urlA = toAbsoluteMeetUrl(memberA.accessUrl);
		const urlB = toAbsoluteMeetUrl(memberB.accessUrl);

		const pageA = await browser.newPage();
		await openMeeting(pageA, urlA);

		const pageB = await browser.newPage();
		await openMeeting(pageB, urlB);

		await waitForRemoteStream(pageA);

		// Hover over remote stream
		await hoverStream(pageA, '.OV_stream.remote');
		await expect(pageA.locator('#pin-btn')).toBeVisible();

		await pageB.close();
		await pageA.close();
	});

	test('should show the SILENCE button ONLY over the REMOTE video', async ({ browser }) => {
		const room = await createRoom({ roomName: `silence-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const memberA = await createRoomMember({ roomId: room.roomId, name: `silence-a-${Date.now()}`, baseRole: 'moderator' });
		const memberB = await createRoomMember({ roomId: room.roomId, name: `silence-b-${Date.now()}`, baseRole: 'moderator' });
		const urlA = toAbsoluteMeetUrl(memberA.accessUrl);
		const urlB = toAbsoluteMeetUrl(memberB.accessUrl);

		const pageA = await browser.newPage();
		await openMeeting(pageA, urlA);

		const pageB = await browser.newPage();
		await openMeeting(pageB, urlB);

		await waitForRemoteStream(pageA);

		// Local stream should NOT have silence button
		await hoverStream(pageA, '.OV_publisher .OV_stream_video.local');
		await pageA.waitForTimeout(500);
		await expect(pageA.locator('.OV_publisher .OV_stream_video.local #silence-btn')).toHaveCount(0);

		// Remote stream should have silence button
		await hoverStream(pageA, '.OV_stream.remote');
		await expect(pageA.locator('#silence-btn')).toBeVisible();

		await pageB.close();
		await pageA.close();
	});
});

test.describe('Audio detection - Speaking indicator', () => {
	test.describe.configure({ timeout: 30_000 });
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should show the audio detection elements when participant is speaking', async ({ browser }) => {
		const room = await createRoom({ roomName: `speaking-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const memberA = await createRoomMember({ roomId: room.roomId, name: `speak-a-${Date.now()}`, baseRole: 'moderator' });
		const memberB = await createRoomMember({ roomId: room.roomId, name: `speak-b-${Date.now()}`, baseRole: 'moderator' });
		const urlA = toAbsoluteMeetUrl(memberA.accessUrl);
		const urlB = toAbsoluteMeetUrl(memberB.accessUrl);

		const pageA = await browser.newPage();
		await openMeeting(pageA, `${urlA}&audioEnabled=false`);

		const pageB = await browser.newPage();
		await openMeeting(pageB, urlB);

		await waitForRemoteStream(pageA);

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

		await pageB.close();
		await pageA.close();
	});
});
