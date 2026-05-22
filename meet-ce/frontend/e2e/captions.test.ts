import { expect, test } from '@playwright/test';
import { getCaptionsButton, getCaptionsButtonIcon } from './helpers/captions.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms, getCaptionsGlobalConfig } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';

test.describe('Captions E2E Tests', () => {
	const createdRoomIds: string[] = [];

	const createCaptionsRoom = async (enabled = true): Promise<string> => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl({
			config: { captions: { enabled } }
		});
		createdRoomIds.push(room.roomId);
		return accessUrl;
	};

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should hide captions button when captions are disabled in room config', async ({ page }) => {
		const accessUrl = await createCaptionsRoom(false);

		await openMeeting(page, accessUrl);
		await expect(page.locator('#captions-button')).toHaveCount(0);
	});

	test('should show captions button and reflect global backend enablement', async ({ page }) => {
		const globalCaptionsConfig = await getCaptionsGlobalConfig();
		const accessUrl = await createCaptionsRoom(true);

		await openMeeting(page, accessUrl);
		await expect(getCaptionsButton(page)).toBeVisible();

		if (globalCaptionsConfig.enabled) {
			await expect(getCaptionsButton(page)).toBeEnabled();
			await expect(getCaptionsButtonIcon(page)).toContainText('subtitles');
		} else {
			await expect(getCaptionsButton(page)).toBeDisabled();
			await expect(getCaptionsButtonIcon(page)).toContainText('subtitles_off');
		}
	});

	test('should toggle captions panel when room captions and global captions are enabled', async ({ page }) => {
		const globalCaptionsConfig = await getCaptionsGlobalConfig();
		test.skip(!globalCaptionsConfig.enabled, 'Global captions are disabled in backend configuration');

		const accessUrl = await createCaptionsRoom(true);

		await openMeeting(page, accessUrl);
		await expect(getCaptionsButton(page)).toBeVisible();
		await expect(getCaptionsButton(page)).toBeEnabled();

		await getCaptionsButton(page).click();
		await expect(page.locator('.captions-container')).toBeVisible();

		await getCaptionsButton(page).click();
		await expect(page.locator('.captions-container')).toHaveCount(0);
	});
});
