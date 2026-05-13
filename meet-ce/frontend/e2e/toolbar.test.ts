import { expect, test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import {
	expectCopiedUrl,
	installClipboardCapture,
	openMeeting,
	toggleCamera,
	toggleMicrophone
} from './helpers/meeting-ui.helper';

test.describe('Toolbar button functionality for local media control', () => {
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should toggle mute/unmute on the local microphone and update the icon accordingly', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await toggleMicrophone(page);
		await expect(page.locator('#mic-btn #mic_off')).toBeVisible();

		await toggleMicrophone(page);
		await expect(page.locator('#mic-btn #mic')).toBeVisible();
	});

	test('should toggle mute/unmute on the local camera and update the icon accordingly', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await toggleCamera(page);
		await expect(page.locator('#camera-btn #videocam_off')).toBeVisible();

		await toggleCamera(page);
		await expect(page.locator('#camera-btn #videocam')).toBeVisible();
	});

	test('should copy speaker link from toolbar copy-speaker-link button', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);
		await installClipboardCapture(page);

		await expect(page.locator('#copy-speaker-link')).toBeVisible();
		await page.locator('#copy-speaker-link').click();
		await expectCopiedUrl(page);
	});
});
