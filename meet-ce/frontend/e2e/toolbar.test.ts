import { expect, test } from '@playwright/test';
import { toggleCamera, toggleMicrophone } from './helpers/media-controls.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
import { openLayoutSettingsPanel, openMoreOptionsMenu } from './helpers/panels.helper';

test.describe('Toolbar Buttons E2E Tests', () => {
	const createdRoomIds: string[] = [];

	let roomId: string;
	let accessUrl: string;

	test.beforeEach(async () => {
		const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl();
		roomId = room.roomId;
		accessUrl = url;
		createdRoomIds.push(roomId);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should toggle mute/unmute on the local microphone and update the icon accordingly', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await toggleMicrophone(page);
		await expect(page.locator('#mic-btn #mic_off')).toBeVisible();

		await toggleMicrophone(page);
		await expect(page.locator('#mic-btn #mic')).toBeVisible();
	});

	test('should toggle mute/unmute on the local camera and update the icon accordingly', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await toggleCamera(page);
		await expect(page.locator('#camera-btn #videocam_off')).toBeVisible();

		await toggleCamera(page);
		await expect(page.locator('#camera-btn #videocam')).toBeVisible();
	});

	test('should open settings panel clicking layout toolbar button', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await openLayoutSettingsPanel(page);
		await expect(page.locator('.layout-section')).toBeVisible();
		await expect(page.locator('.theme-section')).toBeVisible();
	});

	// Guards the only two DOM anchors in the app that are addressed by *string* id, both from
	// `toolbar.component.ts`: `documentService.toggleFullscreen('meeting-stage')` and
	// `cdkOverlayService.setSelector('#meeting-stage')`. Neither is visible to the compiler, and
	// until this test nothing covered them — renaming the id silently broke fullscreen and left
	// every overlay (menus, dialogs, tooltips) invisible behind the fullscreened element.
	test('should fullscreen the meeting stage and move CDK overlays inside it', async ({ page }) => {
		await openMeeting(page, accessUrl);

		// Opening the menu also creates the .cdk-overlay-container that has to be re-parented.
		await openMoreOptionsMenu(page);
		await page.locator('#fullscreen-btn').click();

		// requestFullscreen resolves asynchronously, so poll rather than read once.
		await expect
			.poll(() => page.evaluate(() => document.fullscreenElement?.id ?? null), { timeout: 10_000 })
			.toBe('meeting-stage');
		await expect(page.locator('#meeting-stage > .cdk-overlay-container')).toHaveCount(1);

		// The menu lives in that overlay container: if it were left on <body> it would render
		// behind the fullscreened element instead of inside it.
		await openMoreOptionsMenu(page);
		await expect(page.locator('#fullscreen-btn mat-icon')).toHaveText('fullscreen_exit');
	});
});
