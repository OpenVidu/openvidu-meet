import { MeetRoomStatus, MeetWebhookEventType } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { createRoom, deleteRooms, getRoom } from '../helpers/meet-api.helper';
import { endMeetingCommand, expectWebhook, openMeeting } from '../helpers/testapp.helper';
import { getWebhookFromStorage } from '../helpers/ui-utils.helper';
import { INTEGRATIONS } from '../helpers/webcomponent.helper';

test.describe('Webhooks E2E Tests', () => {
	const createdRoomIds: string[] = [];
	let roomId: string;

	test.beforeEach(async () => {
		({ roomId } = await createRoom());
		createdRoomIds.push(roomId);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	for (const integration of INTEGRATIONS) {
		test(`should receive meetingStarted and meetingEnded webhooks [${integration}]`, async ({ page }) => {
			await openMeeting(page, roomId, { integration, role: 'moderator' });

			await expectWebhook(page, MeetWebhookEventType.MEETING_STARTED);

			const [meetingStartedWebhook, actualRoom] = await Promise.all([
				getWebhookFromStorage(page, roomId, MeetWebhookEventType.MEETING_STARTED),
				getRoom(roomId)
			]);
			expect(meetingStartedWebhook.data).toMatchObject(actualRoom as any);

			await endMeetingCommand(page);
			await expectWebhook(page, MeetWebhookEventType.MEETING_ENDED);

			const meetingEndedWebhook = await getWebhookFromStorage(page, roomId, MeetWebhookEventType.MEETING_ENDED);
			actualRoom.status = MeetRoomStatus.OPEN;
			expect(meetingEndedWebhook.data).toMatchObject(actualRoom as any);
		});
	}
});
