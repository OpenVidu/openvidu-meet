import { expect, test } from '@playwright/test';
import { createRoomAndGetAccessUrl, deleteRooms } from './helpers/meet-api.helper';
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
    togglePrejoinCamera
} from './helpers/meeting-ui.helper';

test.describe('Virtual Backgrounds', () => {
    test.describe.configure({ timeout: 120_000 });
    const createdRoomIds = new Set<string>();

    test.afterAll(async () => {
        await deleteRooms(createdRoomIds);
    });



    test('should close BACKGROUNDS on prejoin page when VIDEO is disabled', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`vb-prejoin-${Date.now()}`, undefined, { prejoin: 'true' }, createdRoomIds);
        await openPrejoin(page, accessUrl);

        const backgroundsButton = page.locator('#backgrounds-button');
        await expect(backgroundsButton).toBeVisible();
        await expect(backgroundsButton).toBeEnabled();

        await openPrejoinBackgroundsPanel(page);
        await togglePrejoinCamera(page);

        await expectVisible(page, '#video-poster');
        await expect(backgroundsButton).toBeVisible();
        await expect(backgroundsButton).toBeDisabled();
        await expect(page.locator('#background-effects-container')).toHaveCount(0);
    });

    test('should open and close BACKGROUNDS panel on prejoin page', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`vb-prejoin-toggle-${Date.now()}`, undefined, {
            prejoin: 'true'
        }, createdRoomIds);
        await openPrejoin(page, accessUrl);

        await expect(page.locator('#backgrounds-button')).toBeEnabled();
        await openPrejoinBackgroundsPanel(page);
        await closePrejoinBackgroundsPanel(page);
    });

    test('should apply a background effect on prejoin page', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`vb-prejoin-apply-${Date.now()}`, undefined, {
            prejoin: 'true'
        }, createdRoomIds);
        await openPrejoin(page, accessUrl);

        const before = await captureVideoElementScreenshot(page);
        await openPrejoinBackgroundsPanel(page);
        await applyBackgroundEffect(page, '1');
        await closePrejoinBackgroundsPanel(page);
        const after = await captureVideoElementScreenshot(page);

        expectSignificantImageDifference(before, after);
    });

    test('should open and close BACKGROUNDS panel in the room', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`vb-room-toggle-${Date.now()}`, undefined, undefined, createdRoomIds);
        await openMeeting(page, accessUrl);

        await openRoomBackgroundsPanel(page);
        await closeRoomBackgroundsPanel(page);
    });

    test('should apply a background effect in the room', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`vb-room-apply-${Date.now()}`, undefined, undefined, createdRoomIds);
        await openMeeting(page, accessUrl);

        const before = await captureVideoElementScreenshot(page);
        await openRoomBackgroundsPanel(page);
        await applyBackgroundEffect(page, '1');
        await closeRoomBackgroundsPanel(page);
        const after = await captureVideoElementScreenshot(page);

        expectSignificantImageDifference(before, after);
    });
});
