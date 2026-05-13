import { expect, test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { expectCopiedUrl, installClipboardCapture, openMeeting } from './helpers/meeting-ui.helper';

test.describe('Share links overlay', () => {
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should show share-link-overlay with main-share-meeting-link and copy-url-btn when joining', async ({
		page
	}) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);
		await installClipboardCapture(page);

		const shareOverlay = page.locator('#share-link-overlay');
		await expect(shareOverlay).toBeVisible();
		await expect(shareOverlay.locator('.main-share-meeting-link')).toBeVisible();
		await expect(shareOverlay.locator('.copy-url-btn')).toBeVisible();

		await shareOverlay.locator('.copy-url-btn').click();
		await expectCopiedUrl(page);
	});
});
