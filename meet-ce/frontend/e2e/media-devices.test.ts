import { expect, test } from '@playwright/test';
import { assertHasVideoDeviceOption, cleanupMediaDevicesRooms, createMediaDevicesAccessUrl, getFirstVideoTrackLabel, getScreenTrackLabel } from './helpers/media-devices.helper';
import { openMeeting, openPrejoin, openSettingsPanel, startScreensharing } from './helpers/meeting-ui.helper';

test.describe('Media Devices: Virtual Device Replacement and Permissions Handling', () => {
    test.describe.configure({ timeout: 60_000 });

    test.afterAll(async () => {
        await cleanupMediaDevicesRooms();
    });

    test('should allow selecting and replacing the video track with a custom virtual device in the prejoin page', async ({ page }) => {
        const accessUrl = await createMediaDevicesAccessUrl(`md-prejoin-${Date.now()}`, {
            prejoin: 'true',
            fakeDevices: 'true'
        });
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
        const accessUrl = await createMediaDevicesAccessUrl(`md-room-${Date.now()}`, {
            prejoin: 'false',
            fakeDevices: 'true'
        });
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
        const accessUrl = await createMediaDevicesAccessUrl(`md-screen-${Date.now()}`, {
            prejoin: 'false',
            fakeDevices: 'true'
        });
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

    test.afterAll(async () => {
        await cleanupMediaDevicesRooms();
    });

    test('should camera and microphone buttons be disabled in the prejoin page when permissions are denied', async ({ page }) => {
        const accessUrl = await createMediaDevicesAccessUrl(`md-denied-prejoin-${Date.now()}`, { prejoin: 'true' });
        await openPrejoin(page, accessUrl);

        await expect(page.locator('#no-video-device-message')).toBeVisible();
        await expect(page.locator('#no-audio-device-message')).toBeVisible();
        const backgroundsButton = page.locator('#backgrounds-button');

        if ((await backgroundsButton.count()) > 0) {
            await expect(backgroundsButton).toBeDisabled();
        }
    });

    test('should camera and microphone buttons be disabled in the room page when permissions are denied', async ({ page }) => {
        const accessUrl = await createMediaDevicesAccessUrl(`md-denied-room-${Date.now()}`, { prejoin: 'true' });
        await openPrejoin(page, accessUrl);
        await page.locator('#join-button').click();
        await expect(page.locator('#layout-container')).toBeVisible();

        await expect(page.locator('#camera-btn')).toBeDisabled();
        await expect(page.locator('#mic-btn')).toBeDisabled();
    });

    test('should camera and microphone buttons be disabled in the room page without prejoin when permissions are denied', async ({ page }) => {
        const accessUrl = await createMediaDevicesAccessUrl(`md-denied-noprejoin-${Date.now()}`, {
            prejoin: 'false'
        });
        await openMeeting(page, accessUrl);

        await expect(page.locator('#camera-btn')).toBeDisabled();
        await expect(page.locator('#mic-btn')).toBeDisabled();
    });

    test('should show an audio and video device warning in settings when permissions are denied', async ({ page }) => {
        const accessUrl = await createMediaDevicesAccessUrl(`md-denied-settings-${Date.now()}`, {
            prejoin: 'false'
        });
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
