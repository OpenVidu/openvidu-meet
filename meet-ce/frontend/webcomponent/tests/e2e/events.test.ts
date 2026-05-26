import { LeftEventReason, WebComponentEvent } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { iframeLocator } from '../helpers/iframe.helper';
import { createRoom, deleteRooms } from '../helpers/meet-api.helper';
import {
	endMeetingCommand,
	eventLocator,
	expectEvent,
	leaveMeeting,
	leaveRoomCommand,
	openMeeting
} from '../helpers/testapp.helper';

test.describe('WebComponent Events E2E Tests', () => {
	const createdRoomIds: string[] = [];
	let roomId: string;

	test.beforeEach(async () => {
		({ roomId } = await createRoom());
		createdRoomIds.push(roomId);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test.describe('JOINED Event', () => {
		test('should receive joined event when joining as moderator', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			const joined = await expectEvent(page, WebComponentEvent.JOINED);
			await expect(joined).toContainText('roomId');
			await expect(joined).toContainText('participantIdentity');
			await expect(joined).toContainText(roomId);
		});

		test('should receive joined event when joining as speaker', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			const joined = await expectEvent(page, WebComponentEvent.JOINED);
			await expect(joined).toContainText('roomId');
			await expect(joined).toContainText('participantIdentity');
			await expect(joined).toContainText(roomId);
		});

		test('should receive only one joined event per join action', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);
		});
	});

	test.describe('LEFT Event', () => {
		test('should receive left event with voluntary_leave reason when using leave command', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			await leaveRoomCommand(page);

			const left = await expectEvent(page, WebComponentEvent.LEFT);
			await expect(left).toContainText('roomId');
			await expect(left).toContainText('participantIdentity');
			await expect(left).toContainText('reason');
			await expect(left).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
		});

		test('should receive left event with voluntary_leave reason when using disconnect button', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			await leaveMeeting(page, { role: 'moderator' });

			const left = await expectEvent(page, WebComponentEvent.LEFT);
			await expect(left).toContainText('reason');
			await expect(left).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
		});

		test('should receive left event with meeting_ended reason when moderator ends meeting', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			await endMeetingCommand(page);

			const left = await expectEvent(page, WebComponentEvent.LEFT);
			await expect(left).toContainText('reason');
			await expect(left).toContainText(LeftEventReason.MEETING_ENDED);
		});

		test('should receive left event when speaker leaves room', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });
			await expectEvent(page, WebComponentEvent.JOINED);

			await leaveMeeting(page);

			const left = await expectEvent(page, WebComponentEvent.LEFT);
			await expect(left).toContainText('roomId');
			await expect(left).toContainText('participantIdentity');
			await expect(left).toContainText('reason');
		});
	});

	test.describe('CLOSED Event', () => {
		test('should receive closed event after leaving as moderator', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			await leaveRoomCommand(page);
			await expectEvent(page, WebComponentEvent.LEFT);

			await iframeLocator(page, '#back-btn').click();
			await expect(eventLocator(page, WebComponentEvent.CLOSED).first()).toBeVisible({ timeout: 5_000 });
		});

		test('should receive closed event after ending meeting', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			await endMeetingCommand(page);
			await expectEvent(page, WebComponentEvent.LEFT);

			await iframeLocator(page, '#back-btn').click();
			await expect(eventLocator(page, WebComponentEvent.CLOSED).first()).toBeVisible({ timeout: 5_000 });
		});
	});

	test.describe('Event Sequences', () => {
		test('should receive events in correct order: joined -> left', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			const joined = eventLocator(page, WebComponentEvent.JOINED);
			const left = eventLocator(page, WebComponentEvent.LEFT);
			await expect(joined).toHaveCount(1, { timeout: 10_000 });
			await expect(left).toHaveCount(0);

			await leaveRoomCommand(page);

			await expect(left).toHaveCount(1, { timeout: 10_000 });
			await expect(joined).toHaveCount(1);
		});
	});

	test.describe('Event Payload Validation', () => {
		test('should include correct roomId in joined event payload', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			const joined = await expectEvent(page, WebComponentEvent.JOINED);
			await expect(joined).toContainText(roomId);
			await expect(joined).toContainText('"roomId"');
		});

		test('should include participantIdentity in joined event payload', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			const joined = await expectEvent(page, WebComponentEvent.JOINED);
			await expect(joined).toContainText('"participantIdentity"');
			await expect(joined).toHaveText(/participantIdentity.*:/);
		});

		test('should include all required fields in left event payload', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			await leaveRoomCommand(page);

			const left = await expectEvent(page, WebComponentEvent.LEFT);
			await expect(left).toContainText('"roomId"');
			await expect(left).toContainText('"participantIdentity"');
			await expect(left).toContainText('"reason"');
			await expect(left).toContainText(roomId);
		});

		test('should have valid reason in left event payload', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			await leaveRoomCommand(page);
			const left = await expectEvent(page, WebComponentEvent.LEFT);

			const eventText = (await left.textContent()) ?? '';
			const validReasons = Object.values(LeftEventReason);
			const hasValidReason = validReasons.some((reason) => eventText.includes(reason));
			expect(hasValidReason).toBe(true);
		});
	});

	test.describe('Event Error Handling', () => {
		test('should handle joining and immediately leaving', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			await leaveRoomCommand(page);
			await expectEvent(page, WebComponentEvent.LEFT);
		});

		test('should not emit duplicate events on rapid actions', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			const leaveBtn = page.locator('#leave-room-btn');
			await leaveBtn.click();
			await leaveBtn.click().catch(() => {});
			await leaveBtn.click().catch(() => {});

			await expectEvent(page, WebComponentEvent.LEFT);
		});
	});
});
