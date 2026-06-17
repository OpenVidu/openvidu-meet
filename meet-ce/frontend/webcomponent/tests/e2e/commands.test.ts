import { LeftEventReason, MeetWebhookEventType, WebComponentEvent } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { wcLocator } from '../helpers/webcomponent.helper';
import { createRoom, deleteRooms } from '../helpers/meet-api.helper';
import {
	endMeetingCommand,
	eventLocator,
	expectEvent,
	expectWebhook,
	kickParticipantCommand,
	leaveMeeting,
	leaveRoomCommand,
	openMeeting
} from '../helpers/testapp.helper';

test.describe('WebComponent Commands E2E Tests', () => {
	const createdRoomIds: string[] = [];
	let roomId: string;

	test.beforeEach(async () => {
		({ roomId } = await createRoom());
		createdRoomIds.push(roomId);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test.describe('LEAVE_ROOM Command', () => {
		test('should disconnect moderator from the room', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			await leaveRoomCommand(page);

			const left = await expectEvent(page, WebComponentEvent.LEFT);
			await expect(left).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
		});

		test('should disconnect speaker from the room', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });
			await expectEvent(page, WebComponentEvent.JOINED);

			await leaveRoomCommand(page);

			const left = await expectEvent(page, WebComponentEvent.LEFT);
			await expect(left).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
		});

		test('should not end the meeting when moderator leaves via leaveRoom', async ({ page, browser }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			const speakerContext = await browser.newContext();
			const speakerPage = await speakerContext.newPage();
			await openMeeting(speakerPage, roomId, { role: 'speaker' });
			await expectEvent(speakerPage, WebComponentEvent.JOINED);

			await expect(wcLocator(page, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

			await leaveRoomCommand(page);
			await expectEvent(page, WebComponentEvent.LEFT);

			// Speaker should still be in the meeting
			await expect(wcLocator(speakerPage, 'ov-session')).toBeVisible();
			await expect(eventLocator(speakerPage, WebComponentEvent.LEFT)).toHaveCount(0);

			await leaveMeeting(speakerPage);
			await speakerContext.close();
		});
	});

	test.describe('END_MEETING Command', () => {
		test('should end the meeting and emit left event with meeting_ended reason', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			await endMeetingCommand(page);

			const left = await expectEvent(page, WebComponentEvent.LEFT);
			await expect(left).toContainText(LeftEventReason.MEETING_ENDED);
		});

		test('should disconnect all participants when moderator ends the meeting', async ({ page, browser }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			const speakerContext = await browser.newContext();
			const speakerPage = await speakerContext.newPage();
			await openMeeting(speakerPage, roomId, { role: 'speaker' });
			await expectEvent(speakerPage, WebComponentEvent.JOINED);

			await expect(wcLocator(page, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

			await endMeetingCommand(page);

			const moderatorLeft = await expectEvent(page, WebComponentEvent.LEFT);
			await expect(moderatorLeft).toContainText(LeftEventReason.MEETING_ENDED);

			const speakerLeft = await expectEvent(speakerPage, WebComponentEvent.LEFT);
			await expect(speakerLeft).toContainText(LeftEventReason.MEETING_ENDED);

			await speakerContext.close();
		});

		test('should trigger meetingEnded webhook', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectWebhook(page, MeetWebhookEventType.MEETING_STARTED);

			await endMeetingCommand(page);

			await expectWebhook(page, MeetWebhookEventType.MEETING_ENDED);
		});
	});

	test.describe('KICK_PARTICIPANT Command', () => {
		test('should kick a speaker from the room', async ({ page, browser }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			const speakerContext = await browser.newContext();
			const speakerPage = await speakerContext.newPage();
			const speakerName = 'Speaker';
			await openMeeting(speakerPage, roomId, { role: 'speaker', name: speakerName });

			const speakerJoined = await expectEvent(speakerPage, WebComponentEvent.JOINED);
			const speakerJoinedText = (await speakerJoined.textContent()) ?? '';
			const match = speakerJoinedText.match(/"participantIdentity"\s*:\s*"([^"]+)"/);
			const speakerIdentity = match?.[1] ?? speakerName;

			await expect(wcLocator(page, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

			await kickParticipantCommand(page, speakerIdentity);

			const speakerLeft = await expectEvent(speakerPage, WebComponentEvent.LEFT);
			await expect(speakerLeft).toContainText(LeftEventReason.PARTICIPANT_KICKED);

			await speakerContext.close();
		});

		test('should not disconnect the moderator who kicks a participant', async ({ page, browser }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			const speakerContext = await browser.newContext();
			const speakerPage = await speakerContext.newPage();
			const speakerName = 'Speaker';
			await openMeeting(speakerPage, roomId, { role: 'speaker', name: speakerName });

			const speakerJoined = await expectEvent(speakerPage, WebComponentEvent.JOINED);
			const speakerJoinedText = (await speakerJoined.textContent()) ?? '';
			const match = speakerJoinedText.match(/"participantIdentity"\s*:\s*"([^"]+)"/);
			const speakerIdentity = match?.[1] ?? speakerName;

			await expect(wcLocator(page, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

			await kickParticipantCommand(page, speakerIdentity);

			await expectEvent(speakerPage, WebComponentEvent.LEFT);

			// Moderator should still be in the meeting
			await expect(wcLocator(page, 'ov-session')).toBeVisible();
			await expect(eventLocator(page, WebComponentEvent.LEFT)).toHaveCount(0);

			await leaveMeeting(page, { role: 'moderator' });
			await speakerContext.close();
		});

		test('should emit left event with participant_kicked reason on the kicked participant', async ({
			page,
			browser
		}) => {
			const speakerName = 'Speaker';

			await openMeeting(page, roomId, { role: 'moderator' });
			await expectEvent(page, WebComponentEvent.JOINED);

			const speakerContext = await browser.newContext();
			const speakerPage = await speakerContext.newPage();
			await openMeeting(speakerPage, roomId, { role: 'speaker', name: speakerName });

			const speakerJoined = await expectEvent(speakerPage, WebComponentEvent.JOINED);
			const speakerJoinedText = (await speakerJoined.textContent()) ?? '';
			const match = speakerJoinedText.match(/"participantIdentity"\s*:\s*"([^"]+)"/);
			const speakerIdentity = match?.[1] ?? speakerName;

			await expect(wcLocator(page, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

			await kickParticipantCommand(page, speakerIdentity);

			const speakerLeft = await expectEvent(speakerPage, WebComponentEvent.LEFT);
			await expect(speakerLeft).toContainText('"reason"');
			await expect(speakerLeft).toContainText(LeftEventReason.PARTICIPANT_KICKED);
			await expect(speakerLeft).toContainText('"roomId"');
			await expect(speakerLeft).toContainText(roomId);

			await leaveMeeting(page, { role: 'moderator' });
			await speakerContext.close();
		});
	});
});
