import { expect, test } from '@playwright/test';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import {
	createRoomAndGetAnonymousAccessUrl,
	deleteRooms,
	getMeetingParticipantIdentities,
	getRoomStatus
} from './helpers/meet-api.helper';
import { clickJoinMeeting, leaveMeeting, openJoinScreen, openPrejoin } from './helpers/meeting-navigation.helper';

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

	test('starts the meeting only when the participant joins from the prejoin', async ({ page }) => {
		await openPrejoin(page, accessUrl);

		await test.step('does not start the meeting while the participant is still choosing devices', async () => {
			// The dwell is what makes this meaningful: the status is read repeatedly over a window long
			// enough for a room created at join screen submit to have been reported started.
			for (let attempt = 0; attempt < 5; attempt++) {
				expect(await getRoomStatus(roomId)).toBe(MeetRoomStatus.OPEN);
				await page.waitForTimeout(1_000);
			}
		});

		await test.step('starts the meeting when the participant joins from the prejoin', async () => {
			await clickJoinMeeting(page);

			await expect.poll(() => getRoomStatus(roomId), { timeout: 15_000 }).toBe(MeetRoomStatus.ACTIVE_MEETING);
		});
	});

	test('joins once, with a single name and identity, when the join button is pressed twice quickly', async ({
		page
	}) => {
		await openPrejoin(page, accessUrl, { name: 'Double Press' });
		const joinRequests: string[] = [];
		page.on('request', (request) => {
			if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/token')) {
				joinRequests.push(request.url());
			}
		});

		await page.locator('#join-button').dblclick();

		await expect(page.locator('#layout-container')).toBeVisible({ timeout: 15_000 });
		await expect.poll(() => getMeetingParticipantIdentities(roomId)).toHaveLength(1);
		expect(joinRequests).toHaveLength(1);
		await expect(page.locator('#participant-name', { hasText: 'Double Press' })).toHaveCount(1);
	});

	test('opened by a direct link, pre-fills the participant name and emits no embedded event on join and leave', async ({
		page
	}) => {
		await page.addInitScript(() => {
			const emitted: string[] = [];
			(window as unknown as { emittedEmbeddedEvents: string[] }).emittedEmbeddedEvents = emitted;
			const postMessage = window.postMessage.bind(window);
			window.postMessage = ((message: unknown, ...rest: unknown[]) => {
				if (typeof message === 'object' && message !== null && 'event' in message) {
					emitted.push(String(message.event));
				}

				return (postMessage as (...args: unknown[]) => void)(message, ...rest);
			}) as typeof window.postMessage;

			const dispatchEvent = EventTarget.prototype.dispatchEvent;

			EventTarget.prototype.dispatchEvent = function (event: Event) {
				if (event instanceof CustomEvent) {
					emitted.push(event.type);
				}

				return dispatchEvent.call(this, event);
			};
		});
		const emittedEvents = () =>
			page.evaluate(() => (window as unknown as { emittedEmbeddedEvents: string[] }).emittedEmbeddedEvents);
		const directLink = new URL(accessUrl);
		directLink.searchParams.set('participant-name', 'John');

		await openJoinScreen(page, directLink.toString());
		await expect(page.locator('#participant-name-input')).toHaveValue('John');

		await page.locator('#participant-name-submit').click();
		await clickJoinMeeting(page);
		await expect(page.locator('#layout-container')).toBeVisible({ timeout: 15_000 });
		await leaveMeeting(page);
		await expect(page.locator('.disconnected-container')).toBeVisible();

		expect(await emittedEvents()).toEqual([]);
	});
});
