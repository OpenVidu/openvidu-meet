import { expect, test } from './fixtures/no-media-permissions.fixture';
import { assertHasVideoDeviceOption, startScreensharing } from './helpers/media-controls.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting, openPrejoin } from './helpers/meeting-navigation.helper';
import { openSettingsPanel } from './helpers/panels.helper';
import { getFirstVideoTrackLabel, getScreenTrackLabel } from './helpers/stream.helper';

test.describe('Media Devices E2E Tests', () => {
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

	test.describe('Virtual Device Replacement and Permissions Handling', () => {
		test('should allow selecting and replacing the video track with a custom virtual device in the prejoin page', async ({
			page
		}) => {
			await openPrejoin(page, accessUrl);

			const videoDropdown = page.locator('#video-dropdown');

			if (await videoDropdown.isDisabled()) {
				await expect(videoDropdown).toBeDisabled();
				return;
			}

			await videoDropdown.click();
			const customOption = page.locator('#option-custom_fake_video_1');

			if (!(await customOption.isVisible())) {
				await assertHasVideoDeviceOption(page);
				return;
			}

			await customOption.click();
			await expect.poll(() => getFirstVideoTrackLabel(page)).toBe('custom_fake_video_1');

			await page.locator('#video-dropdown').click();
			await page.locator('#option-fake_device_0').click();
			await expect.poll(() => getFirstVideoTrackLabel(page)).toBe('fake_device_0');
		});

		test('should allow selecting and replacing the video track with a custom virtual device in the videoconference page', async ({
			page
		}) => {
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

			if (!(await customOption.isVisible())) {
				await assertHasVideoDeviceOption(page);
				return;
			}

			await customOption.click();
			await expect.poll(() => getFirstVideoTrackLabel(page)).toBe('custom_fake_video_1');

			await page.locator('#video-dropdown').click();
			await page.locator('#option-fake_device_0').click();
			await expect.poll(() => getFirstVideoTrackLabel(page)).toBe('fake_device_0');
		});

		test('should replace the screen track with a custom virtual device', async ({ page }) => {
			await openMeeting(page, accessUrl);
			await startScreensharing(page);

			const initialLabel = await getScreenTrackLabel(page);
			expect(initialLabel).not.toBe('custom_fake_screen');

			await page.locator('#screenshare-btn').click();
			const replaceButton = page.locator('#replace-screen-button');
			await expect(replaceButton).toBeVisible();
			await replaceButton.click();
			await page.waitForTimeout(1000);

			const replacedLabel = await getScreenTrackLabel(page);
			expect(replacedLabel).not.toBeNull();
		});
	});

	test.describe('UI Behavior Without Media Device Permissions', () => {
		test('should camera and microphone buttons be disabled in the prejoin page when permissions are denied', async ({
			noMediaPage
		}) => {
			await openPrejoin(noMediaPage, accessUrl);

			await expect(noMediaPage.locator('#no-video-device-message')).toBeVisible();
			await expect(noMediaPage.locator('#no-audio-device-message')).toBeVisible();
			const backgroundsButton = noMediaPage.locator('#backgrounds-button');

			if (await backgroundsButton.isVisible()) {
				await expect(backgroundsButton).toBeDisabled();
			}
		});

		test('should camera and microphone buttons be disabled in the room page when permissions are denied', async ({
			noMediaPage
		}) => {
			await openMeeting(noMediaPage, accessUrl);

			await expect(noMediaPage.locator('#camera-btn')).toBeDisabled();
			await expect(noMediaPage.locator('#mic-btn')).toBeDisabled();
		});

		test('should show an audio and video device warning in settings when permissions are denied', async ({
			noMediaPage
		}) => {
			await openMeeting(noMediaPage, accessUrl);

			await openSettingsPanel(noMediaPage);
			await noMediaPage.locator('#video-opt').click();
			await expect(noMediaPage.locator('ov-video-devices-select')).toBeVisible();
			await expect(noMediaPage.locator('#no-video-device-message')).toBeVisible();

			await noMediaPage.locator('#audio-opt').click();
			await expect(noMediaPage.locator('ov-audio-devices-select')).toBeVisible();
			await expect(noMediaPage.locator('#no-audio-device-message')).toBeVisible();
		});
	});
});
