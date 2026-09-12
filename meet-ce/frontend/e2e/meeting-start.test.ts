import { expect, test } from '@playwright/test';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms, getRoomStatus } from './helpers/meet-api.helper';
import { openMeeting, openPrejoin } from './helpers/meeting-navigation.helper';

/**
 * When the meeting starts, which is when Meet creates the LiveKit room. A participant choosing
 * devices in the prejoin has not joined anything yet, and everything the room mint carries with it
 * (the duration clock, the capacity check, their reserved name) must wait for them to commit.
 */
test.describe('Meeting start E2E Tests', () => {
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

	test('does not start the meeting while the participant is still choosing devices', async ({ page }) => {
		await openPrejoin(page, accessUrl);

		// The dwell is what makes this meaningful: the status is read repeatedly over a window long
		// enough for a room created at lobby submit to have been reported started.
		for (let attempt = 0; attempt < 5; attempt++) {
			expect(await getRoomStatus(roomId)).toBe(MeetRoomStatus.OPEN);
			await page.waitForTimeout(1_000);
		}
	});

	test('starts the meeting when the participant joins from the prejoin', async ({ page }) => {
		await openMeeting(page, accessUrl);

		await expect.poll(() => getRoomStatus(roomId), { timeout: 15_000 }).toBe(MeetRoomStatus.ACTIVE_MEETING);
	});
});
