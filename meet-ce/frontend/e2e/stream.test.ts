import { expect, test, type Browser, type Page } from '@playwright/test';
import { createRoom, createRoomAndGetAccessUrl, deleteRooms, type E2ERoom } from './helpers/meet-api.helper';
import { openMeeting, openPrejoin, startScreensharing, stopScreensharing } from './helpers/meeting-ui.helper';

test.describe('Stream rendering and media toggling scenarios', () => {
    test.describe.configure({ timeout: 120_000 });
    const createdRoomIds = new Set<string>();

    test.afterAll(async () => {
        await deleteRooms(createdRoomIds);
    });

    async function createTrackedRoom(roomName: string): Promise<E2ERoom> {
        const room = await createRoom({ roomName });
        createdRoomIds.add(room.roomId);
        return room;
    }

    async function createTrackedAccessUrl(
        participantName: string,
        room?: E2ERoom,
        queryParams?: Record<string, string>
    ): Promise<string> {
        const { room: createdRoom, accessUrl } = await createRoomAndGetAccessUrl(participantName, room, queryParams);
        createdRoomIds.add(createdRoom.roomId);
        return accessUrl;
    }

    async function joinFromPrejoin(page: Page, accessUrl: string): Promise<void> {
        await openPrejoin(page, accessUrl);
        await page.locator('#join-button').click();
        await expect(page.locator('#layout-container')).toBeVisible();
        await expect(page.locator('.OV_stream.local')).toBeVisible();
    }

    async function expectStreamCount(page: Page, streams: number): Promise<void> {
        await expect(page.locator('.OV_stream')).toHaveCount(streams);
    }

    async function expectScreenCount(page: Page, screens: number): Promise<void> {
        await expect(page.locator('.OV_screen')).toHaveCount(screens);
    }

    async function openTwoParticipants(
        browser: Browser,
        queryParams: Record<string, string>
    ): Promise<{ pageA: Page; pageB: Page }> {
        const room = await createTrackedRoom(`streams-${Date.now()}`);
        const accessUrlA = await createTrackedAccessUrl(`stream-a-${Date.now()}`, room, queryParams);
        const accessUrlB = await createTrackedAccessUrl(`stream-b-${Date.now()}`, room, queryParams);

        const pageA = await browser.newPage();
        await openMeeting(pageA, accessUrlA);

        const pageB = await browser.newPage();
        await openMeeting(pageB, accessUrlB);

        await expect(pageA.locator('.OV_stream.remote')).toBeVisible();
        await expect(pageB.locator('.OV_stream.remote')).toBeVisible();

        return { pageA, pageB };
    }

    test('should not render any video element when joining with video disabled', async ({ page }) => {
        const accessUrl = await createTrackedAccessUrl(`stream-vd-${Date.now()}`, undefined, {
            prejoin: 'true',
            videoEnabled: 'false'
        });
        await joinFromPrejoin(page, accessUrl);
        await expectStreamCount(page, 1);
    });

    test('should render a video element but no audio when joining with audio muted', async ({ page }) => {
        const accessUrl = await createTrackedAccessUrl(`stream-am-${Date.now()}`, undefined, {
            prejoin: 'true',
            audioEnabled: 'false'
        });
        await joinFromPrejoin(page, accessUrl);
        await expectStreamCount(page, 1);
    });

    test('should render both video and audio elements when joining with both enabled', async ({ page }) => {
        const accessUrl = await createTrackedAccessUrl(`stream-va-${Date.now()}`, undefined, {
            prejoin: 'true',
            videoEnabled: 'true',
            audioEnabled: 'true'
        });
        await joinFromPrejoin(page, accessUrl);
        await expectStreamCount(page, 1);
    });

    test('should add a screen share video/audio when sharing screen with both camera and mic muted', async ({ page }) => {
        const accessUrl = await createTrackedAccessUrl(`stream-share-muted-${Date.now()}`, undefined, {
            prejoin: 'true',
            videoEnabled: 'false',
            audioEnabled: 'false'
        });
        await joinFromPrejoin(page, accessUrl);
        await expectStreamCount(page, 1);

        await startScreensharing(page);
        await expect(page.locator('.local_participant.OV_screen')).toBeVisible();
        await expectStreamCount(page, 2);
        await expectScreenCount(page, 1);

        await stopScreensharing(page);
        await expectStreamCount(page, 1);
        await expectScreenCount(page, 0);
    });

    test('should add a screen share video/audio when sharing screen with both camera and mic enabled', async ({ page }) => {
        const accessUrl = await createTrackedAccessUrl(`stream-share-enabled-${Date.now()}`, undefined, {
            prejoin: 'true',
            videoEnabled: 'true',
            audioEnabled: 'true'
        });
        await joinFromPrejoin(page, accessUrl);
        await expectStreamCount(page, 1);

        await startScreensharing(page);
        await expect(page.locator('.local_participant.OV_screen')).toBeVisible();
        await expectStreamCount(page, 2);
        await expectScreenCount(page, 1);

        await stopScreensharing(page);
        await expectStreamCount(page, 1);
        await expectScreenCount(page, 0);
    });

    test('should not render any video/audio elements when two participants join with both video and audio muted', async ({ browser }) => {
        const { pageA, pageB } = await openTwoParticipants(browser, {
            prejoin: 'false',
            videoEnabled: 'false',
            audioEnabled: 'false'
        });

        await expectStreamCount(pageA, 2);
        await expectStreamCount(pageB, 2);

        await pageB.close();
        await pageA.close();
    });

    test('should render two video elements and no audio when two participants join with audio muted', async ({ browser }) => {
        const { pageA, pageB } = await openTwoParticipants(browser, {
            prejoin: 'false',
            videoEnabled: 'true',
            audioEnabled: 'false'
        });

        await expectStreamCount(pageA, 2);
        await expectStreamCount(pageB, 2);

        await pageB.close();
        await pageA.close();
    });

    test('should not render any video elements but should render two audio elements when two participants join with video disabled', async ({ browser }) => {
        const { pageA, pageB } = await openTwoParticipants(browser, {
            prejoin: 'false',
            videoEnabled: 'false'
        });

        await expectStreamCount(pageA, 2);
        await expectStreamCount(pageB, 2);

        await pageB.close();
        await pageA.close();
    });

    test('should add a screen share video/audio when a participant with both video and audio muted shares their screen (two participants)', async ({ browser }) => {
        const { pageA, pageB } = await openTwoParticipants(browser, {
            prejoin: 'false',
            videoEnabled: 'false',
            audioEnabled: 'false'
        });

        await startScreensharing(pageB);
        await expect(pageB.locator('.local_participant.OV_screen')).toBeVisible();
        await expectStreamCount(pageB, 3);
        await expectStreamCount(pageA, 3);
        await expectScreenCount(pageB, 1);
        await expectScreenCount(pageA, 1);

        await stopScreensharing(pageB);
        await expectStreamCount(pageB, 2);
        await expectStreamCount(pageA, 2);
        await expectScreenCount(pageB, 0);
        await expectScreenCount(pageA, 0);

        await pageB.close();
        await pageA.close();
    });

    test('should add a screen share video/audio when a remote participant with both video and audio enabled shares their screen', async ({ browser }) => {
        const { pageA, pageB } = await openTwoParticipants(browser, {
            prejoin: 'false',
            videoEnabled: 'true',
            audioEnabled: 'true'
        });

        await startScreensharing(pageB);
        await expect(pageB.locator('.local_participant.OV_screen')).toBeVisible();
        await expectStreamCount(pageB, 3);
        await expectStreamCount(pageA, 3);
        await expectScreenCount(pageB, 1);
        await expectScreenCount(pageA, 1);

        await stopScreensharing(pageB);
        await expectStreamCount(pageB, 2);
        await expectStreamCount(pageA, 2);
        await expectScreenCount(pageB, 0);
        await expectScreenCount(pageA, 0);

        await pageB.close();
        await pageA.close();
    });
});

test.describe('Stream UI controls and interaction features', () => {
    test.describe.configure({ timeout: 120_000 });
    const createdRoomIds = new Set<string>();

    test.afterAll(async () => {
        await deleteRooms(createdRoomIds);
    });

    async function createTrackedRoom(roomName: string): Promise<E2ERoom> {
        const room = await createRoom({ roomName });
        createdRoomIds.add(room.roomId);
        return room;
    }

    async function createTrackedAccessUrl(participantName: string, room: E2ERoom): Promise<string> {
        const { room: createdRoom, accessUrl } = await createRoomAndGetAccessUrl(participantName, room, { prejoin: 'true' });
        createdRoomIds.add(createdRoom.roomId);
        return accessUrl;
    }

    test('should play the participant video with only audio', async ({ browser }) => {
        const room = await createTrackedRoom(`audio-only-${Date.now()}`);
        const accessUrlA = await createTrackedAccessUrl(`audio-only-a-${Date.now()}`, room);
        const accessUrlB = await createTrackedAccessUrl(`audio-only-b-${Date.now()}`, room);

        const pageA = await browser.newPage();
        await openPrejoin(pageA, accessUrlA);
        await pageA.locator('#join-button').click();
        await expect(pageA.locator('#layout-container')).toBeVisible();

        const pageB = await browser.newPage();
        await openPrejoin(pageB, accessUrlB);
        await pageB.locator('#camera-button').click();
        await pageB.locator('#join-button').click();
        await expect(pageB.locator('#layout-container')).toBeVisible();

        await pageA.waitForTimeout(6000);
        await expect(pageA.locator('#NO_STREAM_PLAYING_EVENT')).toHaveCount(0);

        await pageB.close();
        await pageA.close();
    });

    test('should play the participant video with only video', async ({ browser }) => {
        const room = await createTrackedRoom(`video-only-${Date.now()}`);
        const accessUrlA = await createTrackedAccessUrl(`video-only-a-${Date.now()}`, room);
        const accessUrlB = await createTrackedAccessUrl(`video-only-b-${Date.now()}`, room);

        const pageA = await browser.newPage();
        await openPrejoin(pageA, accessUrlA);
        await pageA.locator('#join-button').click();
        await expect(pageA.locator('#layout-container')).toBeVisible();

        const pageB = await browser.newPage();
        await openPrejoin(pageB, accessUrlB);
        await pageB.locator('#microphone-button').click();
        await pageB.locator('#join-button').click();
        await expect(pageB.locator('#layout-container')).toBeVisible();

        await pageA.waitForTimeout(6000);
        await expect(pageA.locator('#NO_STREAM_PLAYING_EVENT')).toHaveCount(0);

        await pageB.close();
        await pageA.close();
    });
});
