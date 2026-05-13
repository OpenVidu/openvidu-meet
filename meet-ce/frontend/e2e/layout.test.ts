import { expect, test } from '@playwright/test';
import { selectMosaicLayout, setSmartMosaicSliderValue } from './helpers/layout.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import {
	closeSettingsPanel,
	expectHidden,
	expectVisible,
	openLayoutSettingsPanel,
	openMeeting,
	startScreensharing,
	stopScreensharing,
	toggleStreamPin,
	waitForRemoteStream
} from './helpers/meeting-ui.helper';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Layout: Meeting UI elements on join', () => {
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should render layout container, share-link overlay and local video stream after joining', async ({
		page
	}) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await expect(page.locator('#layout')).toBeVisible();
		await expect(page.locator('#share-link-overlay')).toBeVisible();
		await expect(page.locator('.OV_stream_video.local')).toBeVisible();
	});
});

test.describe('Layout: Toolbar and settings panel', () => {
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should show #more-options-btn in toolbar and reveal #grid-layout-settings-btn on click', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await expect(page.locator('#more-options-btn')).toBeVisible();
		await page.locator('#more-options-btn').click();
		await expect(page.locator('#grid-layout-settings-btn')).toBeVisible();
	});

	test('should open settings panel with layout and theme sections when clicking #grid-layout-settings-btn', async ({
		page
	}) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await openLayoutSettingsPanel(page);
		await expect(page.locator('.layout-section')).toBeVisible();
		await expect(page.locator('.theme-section')).toBeVisible();
	});

	test('should have smart-mosaic selected by default and show participant count of 4', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await openLayoutSettingsPanel(page);
		await expect(page.locator('#layout-smart-mosaic')).toContainClass('mat-mdc-radio-checked');
		await expect(page.locator('.participant-count-container')).toBeVisible();
		await expect(page.locator('.participant-count-value')).toHaveText('4');
	});

	test('should hide participant count container when mosaic layout is selected', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await openLayoutSettingsPanel(page);
		await expect(page.locator('.participant-count-container')).toBeVisible();
		await page.locator('#layout-mosaic').click();
		await expectHidden(page, '.participant-count-container');
	});
});

test.describe('Layout: Smart Mosaic participant count filter', () => {
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should show all streams with default settings and limit visible remote streams when participant count is set to 1', async ({
		browser
	}) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB, pageC] = await Promise.all([browser.newPage(), browser.newPage(), browser.newPage()]);

		try {
			await Promise.all([
				openMeeting(pageA, accessUrl),
				openMeeting(pageB, accessUrl),
				openMeeting(pageC, accessUrl)
			]);
			await Promise.all([waitForRemoteStream(pageA), waitForRemoteStream(pageB), waitForRemoteStream(pageC)]);

			// Participant A should see 3 streams: 1 local + 2 remote
			await expect(pageA.locator('.OV_stream_video')).toHaveCount(3, { timeout: 20_000 });
			await expect(pageA.locator('.OV_stream_video.local')).toHaveCount(1);
			await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(2);

			// Open layout settings and reduce participant count to 1
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);

			// Participant A should now see only 2 streams: 1 local + 1 remote
			await expect(pageA.locator('.OV_stream_video')).toHaveCount(2, { timeout: 15_000 });
			await expect(pageA.locator('.OV_stream_video.local')).toHaveCount(1);
			await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(1);
		} finally {
			await Promise.all([pageC.close(), pageB.close(), pageA.close()]);
		}
	});
});

// ---------------------------------------------------------------------------
// Smart Mosaic: Hidden participants indicator
// ---------------------------------------------------------------------------

test.describe('Layout: Smart Mosaic - Hidden participants indicator', () => {
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should show ov-hidden-participants-indicator when remote participants exceed the visible limit', async ({
		browser
	}) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB, pageC] = await Promise.all([browser.newPage(), browser.newPage(), browser.newPage()]);

		try {
			await Promise.all([
				openMeeting(pageA, accessUrl),
				openMeeting(pageB, accessUrl),
				openMeeting(pageC, accessUrl)
			]);
			await Promise.all([waitForRemoteStream(pageA), waitForRemoteStream(pageB), waitForRemoteStream(pageC)]);

			// Limit to 1 visible remote on A's view: 2 remotes present, 1 is hidden
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);

			// The hidden participants indicator must be present and show "+1 more participant"
			await expect(pageA.locator('ov-hidden-participants-indicator')).toBeVisible({ timeout: 10_000 });
			await expect(pageA.locator('.count-text')).toContainText('+1');
		} finally {
			await Promise.all([pageC.close(), pageB.close(), pageA.close()]);
		}
	});

	test('should hide the indicator when switching from smart mosaic to standard mosaic layout', async ({
		browser
	}) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB, pageC] = await Promise.all([browser.newPage(), browser.newPage(), browser.newPage()]);

		try {
			await Promise.all([
				openMeeting(pageA, accessUrl),
				openMeeting(pageB, accessUrl),
				openMeeting(pageC, accessUrl)
			]);
			await Promise.all([waitForRemoteStream(pageA), waitForRemoteStream(pageB), waitForRemoteStream(pageC)]);

			// Set limit to 1 so the hidden indicator appears
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);
			await expect(pageA.locator('ov-hidden-participants-indicator')).toBeVisible({ timeout: 10_000 });
			await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(1, { timeout: 15_000 });

			// Switch to standard mosaic: all remotes become visible, indicator must disappear
			await selectMosaicLayout(pageA);
			await expectHidden(pageA, 'ov-hidden-participants-indicator');
			await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(2, { timeout: 15_000 });
		} finally {
			await Promise.all([pageC.close(), pageB.close(), pageA.close()]);
		}
	});

	test('should update indicator count correctly when the smart mosaic limit is raised', async ({ browser }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		// 4 participants: A (observer) + B, C, D (3 remotes)
		const [pageA, pageB, pageC, pageD] = await Promise.all([
			browser.newPage(),
			browser.newPage(),
			browser.newPage(),
			browser.newPage()
		]);

		try {
			await Promise.all([
				openMeeting(pageA, accessUrl),
				openMeeting(pageB, accessUrl),
				openMeeting(pageC, accessUrl),
				openMeeting(pageD, accessUrl)
			]);
			await Promise.all([
				waitForRemoteStream(pageA),
				waitForRemoteStream(pageB),
				waitForRemoteStream(pageC),
				waitForRemoteStream(pageD)
			]);

			// Limit 1: 3 remotes present, 1 visible, 2 hidden → indicator shows "+2"
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);
			await expect(pageA.locator('.count-text')).toContainText('+2', { timeout: 10_000 });

			// Raise limit to 2: 2 visible, 1 hidden → indicator shows "+1"
			await setSmartMosaicSliderValue(pageA, 2);
			await expect(pageA.locator('.count-text')).toContainText('+1', { timeout: 10_000 });
		} finally {
			await Promise.all([pageD.close(), pageC.close(), pageB.close(), pageA.close()]);
		}
	});
});

// ---------------------------------------------------------------------------
// Smart Mosaic: Indicator placement mode (topbar vs standard)
// ---------------------------------------------------------------------------

test.describe('Layout: Smart Mosaic - Indicator placement mode', () => {
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should display indicator in topbar mode when no participant is pinned', async ({ browser }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB, pageC] = await Promise.all([browser.newPage(), browser.newPage(), browser.newPage()]);

		try {
			await Promise.all([
				openMeeting(pageA, accessUrl),
				openMeeting(pageB, accessUrl),
				openMeeting(pageC, accessUrl)
			]);
			await Promise.all([waitForRemoteStream(pageA), waitForRemoteStream(pageB), waitForRemoteStream(pageC)]);

			// Limit 1, no pin: showTopBarHiddenParticipantsIndicator() is true → OV_top-bar wrapper
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);

			await expectVisible(pageA, '.OV_top-bar ov-hidden-participants-indicator');
			await expectHidden(pageA, '.OV_last ov-hidden-participants-indicator');
		} finally {
			await Promise.all([pageC.close(), pageB.close(), pageA.close()]);
		}
	});

	test('should switch indicator to standard mode when the visible remote participant is pinned', async ({
		browser
	}) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB, pageC] = await Promise.all([browser.newPage(), browser.newPage(), browser.newPage()]);

		try {
			await Promise.all([
				openMeeting(pageA, accessUrl),
				openMeeting(pageB, accessUrl),
				openMeeting(pageC, accessUrl)
			]);
			await Promise.all([waitForRemoteStream(pageA), waitForRemoteStream(pageB), waitForRemoteStream(pageC)]);

			// Set limit to 1 so the indicator appears in topbar mode initially
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);
			await expectVisible(pageA, '.OV_top-bar ov-hidden-participants-indicator');

			// Close the layout settings panel before interacting with the layout streams
			await closeSettingsPanel(pageA);
			await expectHidden(pageA, '#settings-container');

			// Pin the visible remote participant: hasPinnedParticipant becomes true
			// → showTopBarHiddenParticipantsIndicator() returns false → indicator moves to OV_last
			await toggleStreamPin(pageA, '.OV_stream_video.remote');
			await expectVisible(pageA, '.OV_last ov-hidden-participants-indicator');
			await expectHidden(pageA, '.OV_top-bar ov-hidden-participants-indicator');
			await toggleStreamPin(pageA, '.OV_stream_video.remote');
			await expectVisible(pageA, '.OV_top-bar ov-hidden-participants-indicator');
		} finally {
			await Promise.all([pageC.close(), pageB.close(), pageA.close()]);
		}
	});
});

// ---------------------------------------------------------------------------
// Smart Mosaic: Screen sharing always visible regardless of speaker limit
// ---------------------------------------------------------------------------

test.describe('Layout: Smart Mosaic - Screen sharing always visible', () => {
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should always render a remote screen share stream even when the visible participant count limit is 1', async ({
		browser
	}) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB, pageC] = await Promise.all([browser.newPage(), browser.newPage(), browser.newPage()]);

		try {
			await Promise.all([
				openMeeting(pageA, accessUrl),
				openMeeting(pageB, accessUrl),
				openMeeting(pageC, accessUrl)
			]);
			await Promise.all([waitForRemoteStream(pageA), waitForRemoteStream(pageB), waitForRemoteStream(pageC)]);

			// Restrict A's layout to 1 visible remote (B or C fills the slot)
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);
			await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(1, { timeout: 10_000 });

			// C starts screensharing; the component always adds screen-sharers to idsToDisplay
			// so A must see C's screen share even though C is not in the top-1 speaker slot
			await startScreensharing(pageC);
			await expectVisible(pageA, '.OV_stream.remote .OV_video-element.screen-type');
		} finally {
			await Promise.all([pageC.close(), pageB.close(), pageA.close()]);
		}
	});

	test('should remove a remote screen share from the layout only when the screensharer stops', async ({
		browser
	}) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB, pageC] = await Promise.all([browser.newPage(), browser.newPage(), browser.newPage()]);

		try {
			await Promise.all([
				openMeeting(pageA, accessUrl),
				openMeeting(pageB, accessUrl),
				openMeeting(pageC, accessUrl)
			]);
			await Promise.all([waitForRemoteStream(pageA), waitForRemoteStream(pageB), waitForRemoteStream(pageC)]);

			// Limit A's layout to 1 remote
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);

			// B starts screensharing: A must see B's screen share
			await startScreensharing(pageB);
			await expect(pageA.locator('.OV_stream.remote .OV_video-element.screen-type')).toHaveCount(1, {
				timeout: 15_000
			});

			// C also starts screensharing: A now sees two remote screen shares
			await startScreensharing(pageC);
			await expect(pageA.locator('.OV_stream.remote .OV_video-element.screen-type')).toHaveCount(2, {
				timeout: 15_000
			});

			// B stops: only C's screen share remains visible on A's side
			await stopScreensharing(pageB);
			await expect(pageA.locator('.OV_stream.remote .OV_video-element.screen-type')).toHaveCount(1, {
				timeout: 15_000
			});
		} finally {
			await Promise.all([pageC.close(), pageB.close(), pageA.close()]);
		}
	});
});
