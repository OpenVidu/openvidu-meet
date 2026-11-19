import { expect, test, type Page } from '@playwright/test';
import { toggleCamera, toggleMicrophone } from './helpers/media-controls.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { leaveMeeting, openMeeting } from './helpers/meeting-navigation.helper';
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
		await expect(page.locator('#layout-smart-mosaic')).toBeVisible();
	});

	const toolbarButtonsOffScreen = (page: Page) =>
		page.evaluate(() =>
			[...document.querySelectorAll('#toolbar button')]
				.map((button) => ({ id: button.id || button.className, box: button.getBoundingClientRect() }))
				.filter(({ box }) => box.width > 0 && (box.left < 0 || box.right > window.innerWidth))
				.map(({ id }) => id)
		);

	// A desktop browser in a narrow window has no touch screen, yet needs the compact toolbar a phone gets.
	test('should keep every toolbar button on screen in a narrow desktop window', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openMeeting(page, accessUrl);

		await expect.poll(() => toolbarButtonsOffScreen(page)).toEqual([]);

		await openMoreOptionsMenu(page);
		await expect(page.locator('.mat-mdc-menu-panel #captions-button')).toBeVisible();
	});

	// The full toolbar needs more than a tablet's width, so it turns compact whenever its buttons do not fit.
	for (const width of [768, 820, 960]) {
		test(`should keep every toolbar button on screen in a ${width} px window`, async ({ page }) => {
			await page.setViewportSize({ width, height: 1024 });
			await openMeeting(page, accessUrl);

			await expect.poll(() => toolbarButtonsOffScreen(page)).toEqual([]);
		});
	}

	// The toolbar finds the stage by its id, which the compiler does not see, and the overlays (menus,
	// dialogs, tooltips) have to follow it into fullscreen: left on <body> they render behind it.
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

	test('should keep the menus inside the fullscreen stage after another participant leaves, and return them to the page after leaving', async ({
		page,
		browser
	}) => {
		const other = await browser.newPage();

		try {
			await openMeeting(page, accessUrl);
			await openMeeting(other, accessUrl);
			await expect(page.locator('.OV_stream.remote')).toHaveCount(1);

			await openMoreOptionsMenu(page);
			await page.locator('#fullscreen-btn').click();
			await expect(page.locator('#meeting-stage:fullscreen')).toHaveCount(1);

			await leaveMeeting(other);
			await expect(page.locator('.OV_stream.remote')).toHaveCount(0);

			await openMoreOptionsMenu(page);
			await expect(page.locator('#meeting-stage > .cdk-overlay-container #fullscreen-btn')).toBeVisible();

			await page.keyboard.press('Escape');
			await leaveMeeting(page);
			await expect(page.locator('body > .cdk-overlay-container')).toHaveCount(1);
		} finally {
			await other.close();
		}
	});
});
