import { expect, test } from '@playwright/test';
import {
	createExternalRoomMember,
	createRoom,
	createRoomAndGetAccessUrl,
	deleteRooms,
	toAbsoluteMeetUrl,
	type E2ERoom
} from './helpers/meet-api.helper';
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
	test.describe.configure({ timeout: 120_000 });
	const createdRoomIds = new Set<string>();

	async function createAccessUrlForExistingRoom(room: E2ERoom, participantName: string): Promise<{ accessUrl: string }> {
		const member = await createExternalRoomMember({
			roomId: room.roomId,
			name: participantName,
			baseRole: 'moderator'
		});

		return { accessUrl: toAbsoluteMeetUrl(member.accessUrl) };
	}

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should toggle screensharing on and off twice, updating video count', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl(`screen-owner-${Date.now()}`, undefined, undefined, createdRoomIds);
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
		const { accessUrl } = await createRoomAndGetAccessUrl(`screen-owner-${Date.now()}`, undefined, undefined, createdRoomIds);
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
		const { accessUrl } = await createRoomAndGetAccessUrl(`screen-owner-${Date.now()}`, undefined, undefined, createdRoomIds);
		await openMeeting(page, accessUrl);

		await startScreensharing(page);
		await expectScreenTypeCount(page, 1);
		await expectPinnedStreamCount(page, 1);
	});

	test('should replace pinned video when a second participant starts screensharing', async ({ browser }) => {
		const room = await createRoom({ roomName: `screensharing-e2e-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const participantA = await createAccessUrlForExistingRoom(room, `participant-a-${Date.now()}`);
		const participantB = await createAccessUrlForExistingRoom(room, `participant-b-${Date.now()}`);

		const pageA = await browser.newPage();
		const pageB = await browser.newPage();

		try {
			await openMeeting(pageA, participantA.accessUrl);
			await startScreensharing(pageA);
			await expectPinnedStreamCount(pageA, 1);

			await openMeeting(pageB, participantB.accessUrl);
			await startScreensharing(pageB);
			await expectVideoCount(pageB, 4);
			await expectPinnedStreamCount(pageB, 1);

			await expectVideoCount(pageA, 4);
			await expectPinnedStreamCount(pageA, 1);
		} finally {
			await pageB.close();
			await pageA.close();
		}
	});

	test('should unpin screensharing and restore previous pinned video when disabled', async ({ browser }) => {
		const room = await createRoom({ roomName: `screensharing-two-e2e-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const participantA = await createAccessUrlForExistingRoom(room, `participant-a-${Date.now()}`);
		const participantB = await createAccessUrlForExistingRoom(room, `participant-b-${Date.now()}`);

		const pageA = await browser.newPage();
		const pageB = await browser.newPage();

		try {
			await openMeeting(pageA, participantA.accessUrl);
			await startScreensharing(pageA);
			await expectPinnedStreamCount(pageA, 1);

			await openMeeting(pageB, participantB.accessUrl);
			await startScreensharing(pageB);
			await expectVideoCount(pageB, 4);
			await expectPinnedStreamCount(pageB, 1);

			await stopScreensharing(pageB);
			await expectVideoCount(pageB, 3);
			await expectPinnedStreamCount(pageB, 1);

			await expectVideoCount(pageA, 3);
			await expectPinnedStreamCount(pageA, 1);
		} finally {
			await pageB.close();
			await pageA.close();
		}
	});

	test('should correctly share screen with microphone muted and maintain proper track state', async ({ page }) => {
		const { accessUrl } = await createRoomAndGetAccessUrl(`screen-owner-${Date.now()}`, undefined, undefined, createdRoomIds);
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
		const room = await createRoom({ roomName: `screensharing-join-only-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const participantA = await createAccessUrlForExistingRoom(room, `participant-a-${Date.now()}`);
		const participantB = await createAccessUrlForExistingRoom(room, `participant-b-${Date.now()}`);

		const pageA = await browser.newPage();
		const pageB = await browser.newPage();

		try {
			await openMeeting(pageA, participantA.accessUrl);
			await startScreensharing(pageA);
			await expectPinnedStreamCount(pageA, 1);

			await openMeeting(pageB, participantB.accessUrl);
			await expectVideoCount(pageB, 3);
			await expectPinnedStreamCount(pageB, 1);
			await expectScreenTypeCount(pageB, 1);

			await expectPinnedStreamCount(pageA, 1);
			await expectScreenTypeCount(pageA, 1);
		} finally {
			await pageB.close();
			await pageA.close();
		}
	});

	test('should NOT have multiple screens pinned when both participants share screen', async ({ browser }) => {
		const room = await createRoom({ roomName: `pin-bug-case-1-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const participantA = await createAccessUrlForExistingRoom(room, `participant-a-${Date.now()}`);
		const participantB = await createAccessUrlForExistingRoom(room, `participant-b-${Date.now()}`);

		const pageA = await browser.newPage();
		const pageB = await browser.newPage();

		try {
			await openMeeting(pageA, participantA.accessUrl);
			await startScreensharing(pageA);
			await expectPinnedStreamCount(pageA, 1);
			expect(await getPinnedStreamCount(pageA)).toBe(1);

			await openMeeting(pageB, participantB.accessUrl);
			await expectVideoCount(pageB, 3);
			await expectPinnedStreamCount(pageB, 1);

			await startScreensharing(pageB);
			await expectVideoCount(pageB, 4);
			await expectPinnedStreamCount(pageB, 1);

			await expectVideoCount(pageA, 4);
			expect(await getPinnedStreamCount(pageA)).toBe(1);
		} finally {
			await pageB.close();
			await pageA.close();
		}
	});

	test('should NOT re-pin manually unpinned screen when new participant joins', async ({ browser }) => {
		const room = await createRoom({ roomName: `pin-bug-case-2-${Date.now()}` });
		createdRoomIds.add(room.roomId);
		const participantA = await createAccessUrlForExistingRoom(room, `participant-a-${Date.now()}`);
		const participantB = await createAccessUrlForExistingRoom(room, `participant-b-${Date.now()}`);
		const participantC = await createAccessUrlForExistingRoom(room, `participant-c-${Date.now()}`);

		const pageA = await browser.newPage();
		const pageB = await browser.newPage();
		const pageC = await browser.newPage();

		try {
			await openMeeting(pageA, participantA.accessUrl);
			await startScreensharing(pageA);
			await expectPinnedStreamCount(pageA, 1);

			await openMeeting(pageB, participantB.accessUrl);
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

			await openMeeting(pageC, participantC.accessUrl);
			await expect(pageC.locator('#layout-container')).toBeVisible();

			expect(await getPinnedStreamCount(pageB)).toBe(1);
			expect(await getPinnedStreamCount(pageA)).toBe(1);
		} finally {
			await pageC.close();
			await pageB.close();
			await pageA.close();
		}
	});
});
