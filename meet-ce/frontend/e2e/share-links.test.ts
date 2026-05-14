import { expect, test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { expectCopiedUrl, installClipboardCapture, openMeeting } from './helpers/meeting-ui.helper';

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

test.describe('Share links overlay', () => {
	test('should show share-link-overlay with main-share-meeting-link and copy-url-btn when joining', async ({
		page
	}) => {
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
