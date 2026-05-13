import { expect, test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import {
	expectPinnedStreamCount,
	expectScreenTypeCount,
	expectVideoCount,
	getPinnedStreamCount,
	getScreenTypeTracks,
	openMeeting,
	startScreensharing,
	stopScreensharing,
	toggleCamera,
	toggleMicrophone,
	toggleStreamPin,
	unpinCurrentPinnedStream
} from './helpers/meeting-ui.helper';

test.describe('E2E: Screensharing features', () => {
	const createdRoomIds = new Set<string>();

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should toggle screensharing on and off twice, updating video count', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await startScreensharing(page);
		await expectScreenTypeCount(page, 1);
		await expectPinnedStreamCount(page, 1);
		await expectVideoCount(page, 2);

		await stopScreensharing(page);
		await expectScreenTypeCount(page, 0);
		await expectVideoCount(page, 1);

		await startScreensharing(page);
		await expectScreenTypeCount(page, 1);
		await expectPinnedStreamCount(page, 1);
		await expectVideoCount(page, 2);

		await stopScreensharing(page);
		await expectScreenTypeCount(page, 0);
		await expectVideoCount(page, 1);
	});

	test('should show screenshare and muted camera (camera off, screenshare on)', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await toggleCamera(page);
		await startScreensharing(page);
		await expectScreenTypeCount(page, 1);
		await expectPinnedStreamCount(page, 1);
		await expectVideoCount(page, 2);

		await stopScreensharing(page);
		await expectScreenTypeCount(page, 0);
		await expectVideoCount(page, 1);
	});

	test('should display screensharing with a single pinned video', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await startScreensharing(page);
		await expectScreenTypeCount(page, 1);
		await expectPinnedStreamCount(page, 1);
	});

	test('should replace pinned video when a second participant starts screensharing', async ({ browser }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB] = await Promise.all([browser.newPage(), browser.newPage()]);

		try {
			await Promise.all([openMeeting(pageA, accessUrl), openMeeting(pageB, accessUrl)]);

			await startScreensharing(pageA);
			await expectPinnedStreamCount(pageA, 1);

			await startScreensharing(pageB);
			await expectVideoCount(pageB, 4);
			await expectPinnedStreamCount(pageB, 1);

			await expectVideoCount(pageA, 4);
			await expectPinnedStreamCount(pageA, 1);
		} finally {
			await Promise.all([pageB.close(), pageA.close()]);
		}
	});

	test('should unpin screensharing and restore previous pinned video when disabled', async ({ browser }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB] = await Promise.all([browser.newPage(), browser.newPage()]);

		try {
			await Promise.all([openMeeting(pageA, accessUrl), openMeeting(pageB, accessUrl)]);

			await startScreensharing(pageA);
			await expectPinnedStreamCount(pageA, 1);

			await startScreensharing(pageB);
			await expectVideoCount(pageB, 4);
			await expectPinnedStreamCount(pageB, 1);

			await stopScreensharing(pageB);
			await expectVideoCount(pageB, 3);
			await expectPinnedStreamCount(pageB, 1);

			await expectVideoCount(pageA, 3);
			await expectPinnedStreamCount(pageA, 1);
		} finally {
			await Promise.all([pageB.close(), pageA.close()]);
		}
	});

	test('should correctly share screen with microphone muted and maintain proper track state', async ({ page }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);
		await openMeeting(page, accessUrl);

		await toggleMicrophone(page);
		await startScreensharing(page);
		await page.locator('.screen-type').first().waitFor({ state: 'attached' });
		await expectScreenTypeCount(page, 1);
		await expectVideoCount(page, 2);

		const screenTracks = await getScreenTypeTracks(page);
		expect(screenTracks.length).toBe(1);
		expect(screenTracks[0].kind).toBe('video');
		expect(screenTracks[0].enabled).toBe(true);

		await stopScreensharing(page);
		await expectScreenTypeCount(page, 0);
		await expectVideoCount(page, 1);
	});

	test('should keep single pinned stream when second participant joins without sharing screen', async ({
		browser
	}) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB] = await Promise.all([browser.newPage(), browser.newPage()]);

		try {
			await openMeeting(pageA, accessUrl);
			await startScreensharing(pageA);
			await expectPinnedStreamCount(pageA, 1);

			await openMeeting(pageB, accessUrl);
			await expectVideoCount(pageB, 3);
			await expectPinnedStreamCount(pageB, 1);
			await expectScreenTypeCount(pageB, 1);

			await expectPinnedStreamCount(pageA, 1);
			await expectScreenTypeCount(pageA, 1);
		} finally {
			await Promise.all([pageB.close(), pageA.close()]);
		}
	});

	test('should NOT have multiple screens pinned when both participants share screen', async ({ browser }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB] = await Promise.all([browser.newPage(), browser.newPage()]);

		try {
			await openMeeting(pageA, accessUrl);
			await startScreensharing(pageA);
			await expectPinnedStreamCount(pageA, 1);
			expect(await getPinnedStreamCount(pageA)).toBe(1);

			await openMeeting(pageB, accessUrl);
			await expectVideoCount(pageB, 3);
			await expectPinnedStreamCount(pageB, 1);

			await startScreensharing(pageB);
			await expectVideoCount(pageB, 4);
			await expectPinnedStreamCount(pageB, 1);

			await expectVideoCount(pageA, 4);
			expect(await getPinnedStreamCount(pageA)).toBe(1);
		} finally {
			await Promise.all([pageB.close(), pageA.close()]);
		}
	});

	test('should NOT re-pin manually unpinned screen when new participant joins', async ({ browser }) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl();
		createdRoomIds.add(room.roomId);

		const [pageA, pageB, pageC] = await Promise.all([browser.newPage(), browser.newPage(), browser.newPage()]);

		try {
			await openMeeting(pageA, accessUrl);
			await startScreensharing(pageA);
			await expectPinnedStreamCount(pageA, 1);

			await openMeeting(pageB, accessUrl);
			await startScreensharing(pageB);
			await expectVideoCount(pageB, 4);
			await expectPinnedStreamCount(pageB, 1);

			for (let i = 0; i < 3; i++) {
				if ((await getPinnedStreamCount(pageB)) === 0) {
					break;
				}

				await unpinCurrentPinnedStream(pageB);
			}

			expect(await getPinnedStreamCount(pageB)).toBe(0);

			for (let i = 0; i < 3; i++) {
				await toggleStreamPin(pageB, '.OV_stream.remote .screen-type');

				if ((await getPinnedStreamCount(pageB)) === 1) {
					break;
				}
			}

			expect(await getPinnedStreamCount(pageB)).toBe(1);

			await openMeeting(pageC, accessUrl);
			await expect(pageC.locator('#layout-container')).toBeVisible();

			expect(await getPinnedStreamCount(pageB)).toBe(1);
			expect(await getPinnedStreamCount(pageA)).toBe(1);
		} finally {
			await Promise.all([pageC.close(), pageB.close(), pageA.close()]);
		}
	});
});
