import { expect, test } from '@playwright/test';
import { openLayoutSettingsPanel, setSmartMosaicSliderValue } from './helpers/layout.helper';
import { createRoom, createRoomAndGetAccessUrl, createRoomMember, deleteRooms, toAbsoluteMeetUrl } from './helpers/meet-api.helper';
import { expectHidden, openMeeting, waitForRemoteStream } from './helpers/meeting-ui.helper';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Layout: Meeting UI elements on join', () => {
    test.describe.configure({ timeout: 30_000 });
    const createdRoomIds = new Set<string>();

    test.afterAll(async () => {
        await deleteRooms(createdRoomIds);
    });

    test('should render layout container, share-link overlay and local video stream after joining', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `layout-join-${Date.now()}`, createdRoomIds });
        await openMeeting(page, accessUrl);

        await expect(page.locator('#layout')).toBeVisible();
        await expect(page.locator('#share-link-overlay')).toBeVisible();
        await expect(page.locator('.OV_stream_video.local')).toBeVisible();
    });
});

test.describe('Layout: Toolbar and settings panel', () => {
    test.describe.configure({ timeout: 30_000 });
    const createdRoomIds = new Set<string>();

    test.afterAll(async () => {
        await deleteRooms(createdRoomIds);
    });

    test('should show #more-options-btn in toolbar and reveal #grid-layout-settings-btn on click', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `layout-toolbar-btn-${Date.now()}`, createdRoomIds });
        await openMeeting(page, accessUrl);

        await expect(page.locator('#more-options-btn')).toBeVisible();
        await page.locator('#more-options-btn').click();
        await expect(page.locator('#grid-layout-settings-btn')).toBeVisible();
    });

    test('should open settings panel with layout and theme sections when clicking #grid-layout-settings-btn', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `layout-settings-open-${Date.now()}`, createdRoomIds });
        await openMeeting(page, accessUrl);

        await openLayoutSettingsPanel(page);
        await expect(page.locator('.layout-section')).toBeVisible();
        await expect(page.locator('.theme-section')).toBeVisible();
    });

    test('should have smart-mosaic selected by default and show participant count of 4', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `layout-defaults-${Date.now()}`, createdRoomIds });
        await openMeeting(page, accessUrl);

        await openLayoutSettingsPanel(page);
        await expect(page.locator('#layout-smart-mosaic')).toContainClass('mat-mdc-radio-checked');
        await expect(page.locator('.participant-count-container')).toBeVisible();
        await expect(page.locator('.participant-count-value')).toHaveText('4');
    });

    test('should hide participant count container when mosaic layout is selected', async ({ page }) => {
        const { accessUrl } = await createRoomAndGetAccessUrl({ roomName: `layout-mosaic-select-${Date.now()}`, createdRoomIds });
        await openMeeting(page, accessUrl);

        await openLayoutSettingsPanel(page);
        await expect(page.locator('.participant-count-container')).toBeVisible();
        await page.locator('#layout-mosaic').click();
        await expectHidden(page, '.participant-count-container');
    });
});

test.describe('Layout: Smart Mosaic participant count filter', () => {
    test.describe.configure({ timeout: 120_000 });
    const createdRoomIds = new Set<string>();

    test.afterAll(async () => {
        await deleteRooms(createdRoomIds);
    });

    test('should show all streams with default settings and limit visible remote streams when participant count is set to 1', async ({ browser }) => {
        const room = await createRoom({ roomName: `layout-smart-mosaic-count-${Date.now()}` });
        createdRoomIds.add(room.roomId);
        const memberA = await createRoomMember({ roomId: room.roomId, name: `layout-part-a-${Date.now()}`, baseRole: 'moderator' });
        const memberB = await createRoomMember({ roomId: room.roomId, name: `layout-part-b-${Date.now()}`, baseRole: 'moderator' });
        const memberC = await createRoomMember({ roomId: room.roomId, name: `layout-part-c-${Date.now()}`, baseRole: 'moderator' });
        const urlA = toAbsoluteMeetUrl(memberA.accessUrl);
        const urlB = toAbsoluteMeetUrl(memberB.accessUrl);
        const urlC = toAbsoluteMeetUrl(memberC.accessUrl);

        const pageA = await browser.newPage();
        const pageB = await browser.newPage();
        const pageC = await browser.newPage();

        try {
            await openMeeting(pageA, urlA);
            await openMeeting(pageB, urlB);
            await openMeeting(pageC, urlC);

            await Promise.all([waitForRemoteStream(pageA), waitForRemoteStream(pageB), waitForRemoteStream(pageC)]);

            // Participant A should see 3 streams: 1 local + 2 remote
            await expect(pageA.locator('.OV_stream_video')).toHaveCount(3, { timeout: 20_000 });
            await expect(pageA.locator('.OV_stream_video.local')).toHaveCount(1);
            await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(2);

            // Open layout settings and reduce participant count to 1
            await openLayoutSettingsPanel(pageA);
            await setSmartMosaicSliderValue(pageA, 1);

            // Participant A should now see only 2 streams: 1 local + 1 remote
            await expect(pageA.locator('.OV_stream_video')).toHaveCount(2, { timeout: 15_000 });
            await expect(pageA.locator('.OV_stream_video.local')).toHaveCount(1);
            await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(1);
        } finally {
            await pageC.close();
            await pageB.close();
            await pageA.close();
        }
    });
});
