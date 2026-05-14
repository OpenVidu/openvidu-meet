import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { selectMosaicLayout, selectSmartMosaicLayout, setSmartMosaicSliderValue } from './helpers/layout.helper';
import { createRoomAndGetAnonymousAccessUrl, createRoomMember, deleteRooms } from './helpers/meet-api.helper';
import {
	closeSettingsPanel,
	expectHidden,
	expectVisible,
	joinParticipants,
	openLayoutSettingsPanel,
	openMeeting,
	startScreensharing,
	stopScreensharing,
	toggleStreamPin,
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

test.describe('Layout: Meeting UI elements on join', () => {
	test('should render share-link overlay when moderator after joining', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await expect(page.locator('#layout')).toBeVisible();
		await expect(page.locator('#share-link-overlay')).toBeVisible();
		await expect(page.locator('.OV_stream_video.local')).toBeVisible();
	});

	test('should not render share-link overlay when speaker after joining', async ({ page }) => {
		const { accessUrl } = await createRoomMember(roomId, {
			name: `speaker-${Date.now()}`,
			baseRole: MeetRoomMemberRole.SPEAKER
		});

		await openMeeting(page, accessUrl);

		await expect(page.locator('#layout')).toBeVisible();
		await expect(page.locator('.OV_stream_video.local')).toBeVisible();
		await expect(page.locator('#share-link-overlay')).toBeHidden();
	});
});

test.describe('Layout: Toolbar and settings panel', () => {
	test('should show layout settings in settings panel', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await expect(page.locator('#more-options-btn')).toBeVisible();
		await page.locator('#more-options-btn').click();
		await expect(page.locator('#grid-layout-settings-btn')).toBeVisible();
	});

	test('should open settings panel with layout and theme sections when clicking #grid-layout-settings-btn', async ({
		page
	}) => {
		await openMeeting(page, accessUrl);

		await openLayoutSettingsPanel(page);
		await expect(page.locator('.layout-section')).toBeVisible();
		await expect(page.locator('.theme-section')).toBeVisible();
	});

	test('should have smart-mosaic selected by default and show participant count of 4', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await openLayoutSettingsPanel(page);
		await expect(page.locator('#layout-smart-mosaic')).toContainClass('mat-mdc-radio-checked');
		await expect(page.locator('.participant-count-container')).toBeVisible();
		await expect(page.locator('.participant-count-value')).toHaveText('4');
	});

	test('should hide participant count container when mosaic layout is selected', async ({ page }) => {
		await openMeeting(page, accessUrl);
		await openMeeting(page, accessUrl);

		await openLayoutSettingsPanel(page);
		await expect(page.locator('.participant-count-container')).toBeVisible();
		await page.locator('#layout-mosaic').click();
		await expectHidden(page, '.participant-count-container');
	});
});

test.describe('Layout: Smart Mosaic participant filter', () => {
	test('should show filtering out remote participants when the smart mosaic limit is reduced', async ({
		browser
	}) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 3);

		try {
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
			await expectVisible(pageA, 'ov-hidden-participants-indicator');
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+1');
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should restore hidden remote participants with active video when the smart mosaic limit is raised again', async ({
		browser
	}) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 4);

		try {
			await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });

			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 2);
			await waitForRemoteStream(pageA, 2, { requireAudioTracks: true });
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+1');

			await setSmartMosaicSliderValue(pageA, 1);
			await waitForRemoteStream(pageA, 1, { requireAudioTracks: true });
			await expectVisible(pageA, 'ov-hidden-participants-indicator');
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+2');

			await setSmartMosaicSliderValue(pageA, 4);
			await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });
			await expectHidden(pageA, 'ov-hidden-participants-indicator');
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should filtering out remote participants after switching from mosaic to smart mosaic', async ({
		browser
	}) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 4);

		try {
			await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });

			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 2);
			await waitForRemoteStream(pageA, 2, { requireAudioTracks: true });
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+1');

			// Switch to mosaic and verify all remotes are visible
			await selectMosaicLayout(pageA);
			await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });
			await expectHidden(pageA, 'ov-hidden-participants-indicator');

			// Switch back to smart mosaic and verify the previous limit is applied (2 visible remotes, 1 hidden)
			await selectSmartMosaicLayout(pageA);
			await waitForRemoteStream(pageA, 2, { requireAudioTracks: true });
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+1');

			await setSmartMosaicSliderValue(pageA, 1);
			await waitForRemoteStream(pageA, 1, { requireAudioTracks: true });
			await expectVisible(pageA, 'ov-hidden-participants-indicator');
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+2');

			await setSmartMosaicSliderValue(pageA, 4);
			await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });
			await expectHidden(pageA, 'ov-hidden-participants-indicator');
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should filtering out remote participants after screen sharing', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 3);

		try {
			await waitForRemoteStream(pageA, 2, { requireAudioTracks: true });
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);
			await waitForRemoteStream(pageA, 1, { requireAudioTracks: true });

			//screen share
			await startScreensharing(pages[1]);

			await expectVisible(pageA, '.OV_stream.remote.screen-source');
			await pageA.waitForTimeout(1000); // Wait for the layout to update
			// remote screen and 1 remote participant should be visible
			await waitForRemoteStream(pageA, 2, { requireAudioTracks: true });
			await expectVisible(pageA, 'ov-hidden-participants-indicator');
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+1');
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});
});

// ---------------------------------------------------------------------------
// Smart Mosaic: Hidden participants indicator
// ---------------------------------------------------------------------------

test.describe('Layout: Smart Mosaic - Hidden participants indicator', () => {
	test('should show hidden participants indicator when remote participants exceed the visible limit', async ({
		browser
	}) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 3);

		try {
			// Limit to 1 visible remote on A's view: 2 remotes present, 1 is hidden
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);

			// The hidden participants indicator must be present and show "+1 more participant"
			await expect(pageA.locator('ov-hidden-participants-indicator')).toBeVisible({ timeout: 10_000 });
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+1');
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should display indicator in topbar mode when no participant is pinned', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 3);

		try {
			// Limit 1, no pin: showTopBarHiddenParticipantsIndicator() is true → OV_top-bar wrapper
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);

			await expectVisible(pageA, '.hidden-participants-container.horizontal');
			await expectHidden(pageA, '.hidden-participants-container.vertical');
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should switch indicator to standard mode when the visible remote participant is pinned', async ({
		browser
	}) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 3);

		try {
			// Set limit to 1 so the indicator appears in topbar mode initially
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);
			await expectVisible(pageA, '.hidden-participants-container.horizontal');

			// Close the layout settings panel before interacting with the layout streams
			await closeSettingsPanel(pageA);
			await expectHidden(pageA, '#settings-container');

			// Pin the visible remote participant: hasPinnedParticipant becomes true
			// → showTopBarHiddenParticipantsIndicator() returns false → indicator moves to OV_last
			await toggleStreamPin(pageA, '.OV_stream_video.remote');
			await expectVisible(pageA, '.hidden-participants-container.vertical');
			await expectHidden(pageA, '.hidden-participants-container.horizontal');
			await toggleStreamPin(pageA, '.OV_stream_video.remote');
			await expectVisible(pageA, '.hidden-participants-container.horizontal');
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should hide the indicator when switching from smart mosaic to standard mosaic layout', async ({
		browser
	}) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 3);

		try {
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
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should update indicator count correctly when the smart mosaic limit is raised', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 4);

		try {
			// Limit 1: 3 remotes present, 1 visible, 2 hidden → indicator shows "+2"
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+2', {
				timeout: 10_000
			});

			// Raise limit to 2: 2 visible, 1 hidden → indicator shows "+1"
			await setSmartMosaicSliderValue(pageA, 2);
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+1', {
				timeout: 10_000
			});
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});
});

// ---------------------------------------------------------------------------
// Smart Mosaic: Screen sharing always visible regardless of speaker limit
// ---------------------------------------------------------------------------

test.describe('Layout: Smart Mosaic - Screen sharing always visible', () => {
	test('should always render a remote screen share stream even when the visible participant count limit is 1', async ({
		browser
	}) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 3);

		try {
			// Restrict A's layout to 1 visible remote (B or C fills the slot)
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);
			await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(1, { timeout: 10_000 });

			// C starts screensharing; the component always adds screen-sharers to idsToDisplay
			// so A must see C's screen share even though C is not in the top-1 speaker slot
			await startScreensharing(pages[2]);
			await expectVisible(pageA, '.OV_stream.remote.screen-source');
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should remove a remote screen share from the layout only when the screensharer stops', async ({
		browser
	}) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 3);

		try {
			// Limit A's layout to 1 remote
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);

			// B starts screensharing: A must see B's screen share
			await startScreensharing(pages[1]);
			await expect(pageA.locator('.OV_stream.remote .OV_video-element.screen-source')).toHaveCount(1, {
				timeout: 15_000
			});

			// C also starts screensharing: A now sees two remote screen shares
			await startScreensharing(pages[2]);
			await expect(pageA.locator('.OV_stream.remote.screen-source')).toHaveCount(2, {
				timeout: 15_000
			});

			// B stops: only C's screen share remains visible on A's side
			await stopScreensharing(pages[1]);
			await expect(pageA.locator('.OV_stream.remote.screen-source')).toHaveCount(1, {
				timeout: 15_000
			});
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});
});

// ---------------------------------------------------------------------------
// Layout: Switching between smart mosaic and mosaic should maintain the smart mosaic participant count settings and restore them when switching back
// ---------------------------------------------------------------------------

test.describe('Layout: Smart Mosaic - Switching between smart mosaic and mosaic', () => {
	//1. En un meeting con 4 participantes, establecer smart mosaic a 3. Cambiar de smart mosaic a mosaic y verificar que se muestran los 4 participantes.
	//  Cambiar de nuevo a smart mosaic y verificar que el límite de 3 participantes se mantiene y se muestran 3 participantes con el indicador de "+1" para el participante oculto.
	// Reducir el limite a 1 participante y verificar que se muestra 1 participante con el indicador de "+2" para los participantes ocultos.
	//

	test('should show all participants when switching from smart mosaic to mosaic', async ({ browser }) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 4);

		try {
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);
			await waitForRemoteStream(pageA, 1);

			await selectMosaicLayout(pageA);

			await expectHidden(pageA, 'ov-hidden-participants-indicator');
			await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test('should keep the smart mosaic participant selector working after switching to mosaic and back', async ({
		browser
	}) => {
		const { pageA, pages } = await joinParticipants(browser, accessUrl, 4);

		try {
			await openLayoutSettingsPanel(pageA);
			await setSmartMosaicSliderValue(pageA, 1);
			await waitForRemoteStream(pageA, 1);
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+2');

			await selectMosaicLayout(pageA);
			await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });
			await expectHidden(pageA, 'ov-hidden-participants-indicator');

			await selectSmartMosaicLayout(pageA);
			await expect(pageA.locator('.participant-count-container .participant-count-value')).toHaveText('1');
			await waitForRemoteStream(pageA, 1);
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+2');

			await setSmartMosaicSliderValue(pageA, 2);
			await waitForRemoteStream(pageA, 2);
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+1');

			await setSmartMosaicSliderValue(pageA, 3);
			await waitForRemoteStream(pageA, 3);
			await expectHidden(pageA, 'ov-hidden-participants-indicator');
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});
});
