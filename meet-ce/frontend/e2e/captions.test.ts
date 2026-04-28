import { expect, test } from '@playwright/test';
import {
    createCaptionsAccessUrlWithRoomConfig,
    getCaptionsButton,
    getCaptionsButtonIcon
} from './helpers/captions.helper';
import { deleteRooms, getCaptionsGlobalConfig, type CaptionsGlobalConfig } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-ui.helper';

test.describe('Captions controls', () => {
    test.describe.configure({ timeout: 30_000 });
    const createdRoomIds = new Set<string>();

    test.afterAll(async () => {
        await deleteRooms(createdRoomIds);
    });

    test('should hide captions button when captions are disabled in room config', async ({ page }) => {
        const accessUrl = await createCaptionsAccessUrlWithRoomConfig({
            participantName: `captions-hidden-${Date.now()}`,
            captionsEnabledInRoom: false,
            createdRoomIds
        });

        await openMeeting(page, accessUrl);
        await expect(page.locator('#captions-button')).toHaveCount(0);
    });

    test('should show captions button and reflect global backend enablement', async ({ page }) => {
        const globalCaptionsConfig: CaptionsGlobalConfig = await getCaptionsGlobalConfig();
        const accessUrl = await createCaptionsAccessUrlWithRoomConfig({
            participantName: `captions-state-${Date.now()}`,
            captionsEnabledInRoom: true,
            createdRoomIds
        });

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

        const accessUrl = await createCaptionsAccessUrlWithRoomConfig({
            participantName: `captions-toggle-${Date.now()}`,
            captionsEnabledInRoom: true,
            createdRoomIds
        });

        await openMeeting(page, accessUrl);
        await expect(getCaptionsButton(page)).toBeVisible();
        await expect(getCaptionsButton(page)).toBeEnabled();

        await getCaptionsButton(page).click();
        await expect(page.locator('.captions-container')).toBeVisible();

        await getCaptionsButton(page).click();
        await expect(page.locator('.captions-container')).toHaveCount(0);
    });
});
