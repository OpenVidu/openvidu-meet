import { expect, test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import {
	applyBackgroundEffect,
	captureVideoElementScreenshot,
	closePrejoinBackgroundsPanel,
	closeRoomBackgroundsPanel,
	expectSignificantImageDifference,
	expectVisible,
	openMeeting,
	openPrejoin,
	openPrejoinBackgroundsPanel,
	openRoomBackgroundsPanel,
	setPrejoinCameraStatus
} from './helpers/meeting-ui.helper';

test.describe('Virtual Background E2E Tests', () => {
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

	test('should close BACKGROUNDS on prejoin page when VIDEO is disabled', async ({ page }) => {
		await openPrejoin(page, accessUrl);

		const backgroundsButton = page.locator('#backgrounds-button');
		await expect(backgroundsButton).toBeVisible();
		await expect(backgroundsButton).toBeEnabled();

		await openPrejoinBackgroundsPanel(page);
		await setPrejoinCameraStatus(page);

		await expectVisible(page, '#video-poster');
		await expect(backgroundsButton).toBeVisible();
		await expect(backgroundsButton).toBeDisabled();
		await expect(page.locator('#background-effects-container')).toHaveCount(0);
	});

	test('should open and close BACKGROUNDS panel on prejoin page', async ({ page }) => {
		await openPrejoin(page, accessUrl);

		await expect(page.locator('#backgrounds-button')).toBeEnabled();
		await openPrejoinBackgroundsPanel(page);
		await closePrejoinBackgroundsPanel(page);
	});

	test('should apply a background effect on prejoin page', async ({ page }) => {
		await openPrejoin(page, accessUrl);

		const before = await captureVideoElementScreenshot(page);
		await openPrejoinBackgroundsPanel(page);
		await applyBackgroundEffect(page, '1');
		await closePrejoinBackgroundsPanel(page);
		const after = await captureVideoElementScreenshot(page);

		expectSignificantImageDifference(before, after);
	});

	test('should open and close BACKGROUNDS panel in the room', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await openRoomBackgroundsPanel(page);
		await closeRoomBackgroundsPanel(page);
	});

	test('should apply a background effect in the room', async ({ page }) => {
		await openMeeting(page, accessUrl);

		const before = await captureVideoElementScreenshot(page);
		await openRoomBackgroundsPanel(page);
		await applyBackgroundEffect(page, '1');
		await closeRoomBackgroundsPanel(page);
		const after = await captureVideoElementScreenshot(page);

		expectSignificantImageDifference(before, after);
	});
});
