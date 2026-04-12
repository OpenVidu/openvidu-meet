import { expect, test } from '@playwright/test';
import { createRoomAndGetAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting, toggleCamera, toggleMicrophone } from './helpers/meeting-ui.helper';

test.describe('Toolbar button functionality for local media control', () => {
    test.describe.configure({ timeout: 90_000 });
    const createdRoomIds = new Set<string>();

    test.afterAll(async () => {
        await deleteRooms(createdRoomIds);
    });

    async function createTrackedAccessUrl(participantName: string): Promise<string> {
        const { room, accessUrl } = await createRoomAndGetAccessUrl(participantName);
        createdRoomIds.add(room.roomId);
        return accessUrl;
    }

    test('should toggle mute/unmute on the local microphone and update the icon accordingly', async ({ page }) => {
        const accessUrl = await createTrackedAccessUrl(`toolbar-mic-${Date.now()}`);
        await openMeeting(page, accessUrl);

        await toggleMicrophone(page);
        await expect(page.locator('#mic-btn #mic_off')).toBeVisible();

        await toggleMicrophone(page);
        await expect(page.locator('#mic-btn #mic')).toBeVisible();
    });

    test('should toggle mute/unmute on the local camera and update the icon accordingly', async ({ page }) => {
        const accessUrl = await createTrackedAccessUrl(`toolbar-cam-${Date.now()}`);
        await openMeeting(page, accessUrl);

        await toggleCamera(page);
        await expect(page.locator('#camera-btn #videocam_off')).toBeVisible();

        await toggleCamera(page);
        await expect(page.locator('#camera-btn #videocam')).toBeVisible();
    });
});
