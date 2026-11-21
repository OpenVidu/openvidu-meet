import { expect, test } from '@playwright/test';
import {
	applyBackgroundEffect,
	closePrejoinBackgroundsPanel,
	closeRoomBackgroundsPanel,
	openPrejoinBackgroundsPanel,
	openRoomBackgroundsPanel,
	toggleCamera,
	togglePrejoinCamera
} from './helpers/media-controls.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { clickJoinMeeting, leaveMeeting, openMeeting, openPrejoin } from './helpers/meeting-navigation.helper';
import { openMoreOptionsMenu } from './helpers/panels.helper';
import {
	captureVideoElementScreenshot,
	expectDisabled,
	expectSignificantImageDifference,
	expectVisible
} from './helpers/ui-utils.helper';

test.describe('Virtual Background E2E Tests', () => {
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

	test('should close BACKGROUNDS on prejoin page when VIDEO is disabled', async ({ page }) => {
		await openPrejoin(page, accessUrl);

		const backgroundsButton = page.locator('#backgrounds-button');
		await expect(backgroundsButton).toBeVisible();
		await expect(backgroundsButton).toBeEnabled();

		await openPrejoinBackgroundsPanel(page);
		await togglePrejoinCamera(page);

		await expectVisible(page, '.participant-avatar > .poster');
		await expect(backgroundsButton).toBeVisible();
		await expect(backgroundsButton).toBeDisabled();
		// Panel stays mounted in prejoin; disabling video collapses its wrapper.
		await expect(page.locator('.vb-container')).not.toBeVisible();
	});

	test('should apply a background effect on prejoin page', async ({ page }) => {
		await openPrejoin(page, accessUrl);

		await expect(page.locator('#backgrounds-button')).toBeEnabled();
		const before = await captureVideoElementScreenshot(page);
		await openPrejoinBackgroundsPanel(page);
		await applyBackgroundEffect(page, 'professional-1');
		await closePrejoinBackgroundsPanel(page);
		const after = await captureVideoElementScreenshot(page);

		expectSignificantImageDifference(before, after);
	});

	test('should close BACKGROUNDS and disable its button in the meeting when VIDEO is disabled', async ({ page }) => {
		await openMeeting(page, accessUrl);
		await openRoomBackgroundsPanel(page);
		await toggleCamera(page);

		await test.step('should close BACKGROUNDS in meeting when VIDEO is disabled', async () => {
			await expect(page.locator('#background-effects-container')).toHaveCount(0);
		});

		await test.step('should not show BACKGROUNDS panel in the meeting when VIDEO is disabled', async () => {
			await expectVisible(page, '.participant-avatar > .poster');
			await openMoreOptionsMenu(page);
			await expectDisabled(page, '#virtual-bg-btn');
		});
	});

	test('should apply a background effect in the meeting', async ({ page }) => {
		await openMeeting(page, accessUrl);

		const before = await captureVideoElementScreenshot(page);
		await openRoomBackgroundsPanel(page);
		await applyBackgroundEffect(page, 'professional-1');
		await closeRoomBackgroundsPanel(page);
		const after = await captureVideoElementScreenshot(page);

		expectSignificantImageDifference(before, after);
	});

	test('should apply the remembered background effect on the prejoin page and when joining', async ({ page }) => {
		test.slow();
		await openMeeting(page, accessUrl);
		await openRoomBackgroundsPanel(page);
		await applyBackgroundEffect(page, 'professional-1');
		await leaveMeeting(page);

		const { room, accessUrl: nextAccessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.push(room.roomId);

		await openPrejoin(page, nextAccessUrl);
		await openPrejoinBackgroundsPanel(page);
		await expect(page.locator('#effect-professional-1')).toHaveClass(/active-effect-btn/, { timeout: 15_000 });

		await closePrejoinBackgroundsPanel(page);
		await clickJoinMeeting(page);
		await openRoomBackgroundsPanel(page);
		await expect(page.locator('#effect-professional-1')).toHaveClass(/active-effect-btn/, { timeout: 15_000 });
	});
});
