import { expect, test } from '@playwright/test';
import { assertHasVideoDeviceOption, getFirstVideoTrackLabel, getScreenTrackLabel } from './helpers/media-devices.helper';
import { createRoomAndGetAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting, openPrejoin, openSettingsPanel, startScreensharing } from './helpers/meeting-ui.helper';

const createdRoomIds = new Set<string>();

test.describe('Media Devices: Virtual Device Replacement and Permissions Handling', () => {
    test.describe.configure({ timeout: 60_000 });

    test.afterAll(async () => {
        await deleteRooms(createdRoomIds);
    });

    test('should allow selecting and replacing the video track with a custom virtual device in the prejoin page', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`md-prejoin-${Date.now()}`, undefined, {
            prejoin: 'true',
            fakeDevices: 'true'
        }, createdRoomIds);
        await openPrejoin(page, accessUrl);

        const videoDropdown = page.locator('#video-dropdown');

        if (await videoDropdown.isDisabled()) {
            await expect(videoDropdown).toBeDisabled();
            return;
        }

        await videoDropdown.click();
        const customOption = page.locator('#option-custom_fake_video_1');

        if ((await customOption.count()) === 0) {
            await assertHasVideoDeviceOption(page);
            return;
        }

        await customOption.click();
        await page.waitForTimeout(1000);
        await expect.poll(async () => await getFirstVideoTrackLabel(page)).toBe('custom_fake_video_1');

        await page.locator('#video-dropdown').click();
        await page.locator('#option-fake_device_0').click();
        await page.waitForTimeout(1000);
        await expect.poll(async () => await getFirstVideoTrackLabel(page)).toBe('fake_device_0');
    });

    test('should allow selecting and replacing the video track with a custom virtual device in the videoconference page', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`md-room-${Date.now()}`, undefined, {
            prejoin: 'false',
            fakeDevices: 'true'
        }, createdRoomIds);
        await openMeeting(page, accessUrl);

        await openSettingsPanel(page);
        await page.locator('#video-opt').click();
        await expect(page.locator('ov-video-devices-select')).toBeVisible();

        const videoDropdown = page.locator('#video-dropdown');

        if (await videoDropdown.isDisabled()) {
            await expect(videoDropdown).toBeDisabled();
            return;
        }

        await videoDropdown.click();
        const customOption = page.locator('#option-custom_fake_video_1');

        if ((await customOption.count()) === 0) {
            await assertHasVideoDeviceOption(page);
            return;
        }

        await customOption.click();
        await page.waitForTimeout(1000);
        await expect.poll(async () => await getFirstVideoTrackLabel(page)).toBe('custom_fake_video_1');

        await page.locator('#video-dropdown').click();
        await page.locator('#option-fake_device_0').click();
        await page.waitForTimeout(1000);
        await expect.poll(async () => await getFirstVideoTrackLabel(page)).toBe('fake_device_0');
    });

    test('should replace the screen track with a custom virtual device', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`md-screen-${Date.now()}`, undefined, {
            prejoin: 'false',
            fakeDevices: 'true'
        }, createdRoomIds);
        await openMeeting(page, accessUrl);

        await startScreensharing(page);
        await page.waitForTimeout(500);

        const initialLabel = await getScreenTrackLabel(page);
        expect(initialLabel).not.toBe('custom_fake_screen');

        await page.locator('#screenshare-btn').click();
        await page.waitForTimeout(500);

        const replaceButton = page.locator('#replace-screen-button');
        await expect(replaceButton).toBeVisible();
        await replaceButton.click();
        await page.waitForTimeout(1000);
        const replacedLabel = await getScreenTrackLabel(page);
        expect(replacedLabel).not.toBeNull();
        await expect(page.locator('.OV_video-element.screen-type')).toHaveCount(1);
    });
});

test.describe('Media Devices: UI Behavior Without Media Device Permissions @no-media-permissions', () => {
    test.describe.configure({ timeout: 60_000 });
    test.use({ permissions: [] });

    test('should camera and microphone buttons be disabled in the prejoin page when permissions are denied', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`md-denied-prejoin-${Date.now()}`, undefined, { prejoin: 'true' }, createdRoomIds);
        await openPrejoin(page, accessUrl);

        await expect(page.locator('#no-video-device-message')).toBeVisible();
        await expect(page.locator('#no-audio-device-message')).toBeVisible();
        const backgroundsButton = page.locator('#backgrounds-button');

        if ((await backgroundsButton.count()) > 0) {
            await expect(backgroundsButton).toBeDisabled();
        }
    });

    test('should camera and microphone buttons be disabled in the room page when permissions are denied', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`md-denied-room-${Date.now()}`, undefined, { prejoin: 'true' }, createdRoomIds);
        await openPrejoin(page, accessUrl);
        await page.locator('#join-button').click();
        await expect(page.locator('#layout-container')).toBeVisible();

        await expect(page.locator('#camera-btn')).toBeDisabled();
        await expect(page.locator('#mic-btn')).toBeDisabled();
    });

    test('should camera and microphone buttons be disabled in the room page without prejoin when permissions are denied', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`md-denied-noprejoin-${Date.now()}`, undefined, {
            prejoin: 'false'
        }, createdRoomIds);
        await openMeeting(page, accessUrl);

        await expect(page.locator('#camera-btn')).toBeDisabled();
        await expect(page.locator('#mic-btn')).toBeDisabled();
    });

    test('should show an audio and video device warning in settings when permissions are denied', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl(`md-denied-settings-${Date.now()}`, undefined, {
            prejoin: 'false'
        }, createdRoomIds);
        await openMeeting(page, accessUrl);

        await openSettingsPanel(page);
        await page.locator('#video-opt').click();
        await expect(page.locator('ov-video-devices-select')).toBeVisible();
        await expect(page.locator('#no-video-device-message')).toBeVisible();

        await page.locator('#audio-opt').click();
        await expect(page.locator('ov-audio-devices-select')).toBeVisible();
        await expect(page.locator('#no-audio-device-message')).toBeVisible();
    });
});
