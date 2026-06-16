import { expect, test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
import { toggleParticipantsPanel } from './helpers/panels.helper';
import { expectCopiedUrl, installClipboardCapture } from './helpers/ui-utils.helper';

test.describe('Share Link E2E Tests', () => {
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

	test('should render the invite panel (share link) in the participants panel', async ({
		page
	}) => {
		await openMeeting(page, accessUrl);

		await toggleParticipantsPanel(page);

		// In SPA mode the participants panel shows the share/copy meeting link panel
		const invitePanel = page.locator('#invite-panel');
		await expect(invitePanel).toBeVisible();
		await expect(invitePanel.locator('ov-share-meeting-link')).toBeVisible();

		// The webcomponent-only waiting panel must not be present
		await expect(page.locator('#waiting-panel')).toHaveCount(0);
	});
});
