import { expect, test } from '@playwright/test';
import { createRoomAndGetAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { expectCopiedUrl, installClipboardCapture, openMeeting, toggleCamera, toggleMicrophone } from './helpers/meeting-ui.helper';

test.describe('Toolbar button functionality for local media control', () => {
    test.describe.configure({ timeout: 90_000 });
    const createdRoomIds = new Set<string>();

    test.afterAll(async () => {
        await deleteRooms(createdRoomIds);
    });

    async function createTrackedAccessUrl(participantName: string): Promise<string> {
        const { accessUrl } = await createRoomAndGetAccessUrl(participantName, undefined, undefined, createdRoomIds);
        return accessUrl;
    }

    test('should toggle mute/unmute on the local microphone and update the icon accordingly', async ({ page }) => {
        const accessUrl = await createTrackedAccessUrl(`toolbar-mic-${Date.now()}`);
        await openMeeting(page, accessUrl);

        await toggleMicrophone(page);
        await expect(page.locator('#mic-btn #mic_off')).toBeVisible();

        await toggleMicrophone(page);
        await expect(page.locator('#mic-btn #mic')).toBeVisible();
    });

    test('should toggle mute/unmute on the local camera and update the icon accordingly', async ({ page }) => {
        const accessUrl = await createTrackedAccessUrl(`toolbar-cam-${Date.now()}`);
        await openMeeting(page, accessUrl);

        await toggleCamera(page);
        await expect(page.locator('#camera-btn #videocam_off')).toBeVisible();

        await toggleCamera(page);
        await expect(page.locator('#camera-btn #videocam')).toBeVisible();
    });

    test('should open layout settings from toolbar more options and show layout and theme sections', async ({ page }) => {
        const accessUrl = await createTrackedAccessUrl(`toolbar-layout-settings-${Date.now()}`);
        await openMeeting(page, accessUrl);

        await page.locator('#more-options-btn').click();
        await expect(page.locator('#grid-layout-settings-btn')).toBeVisible();
        await page.locator('#grid-layout-settings-btn').click();

        await expect(page.locator('#settings-container')).toBeVisible();
        await expect(page.locator('.layout-section')).toBeVisible();
        await expect(page.locator('.theme-section')).toBeVisible();
    });

    test('should copy speaker link from toolbar copy-speaker-link button', async ({ page }) => {
        const accessUrl = await createTrackedAccessUrl(`toolbar-copy-speaker-link-${Date.now()}`);
        await openMeeting(page, accessUrl);
        await installClipboardCapture(page);

        await expect(page.locator('#copy-speaker-link')).toBeVisible();
        await page.locator('#copy-speaker-link').click();
        await expectCopiedUrl(page);
    });
});
