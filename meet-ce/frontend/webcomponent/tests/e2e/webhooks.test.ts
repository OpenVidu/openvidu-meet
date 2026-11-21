import { MeetParticipantJoinedPayload, MeetRoomStatus, MeetWebhookEventType } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { createRoom, deleteRooms, getRoom, listMeetingParticipants } from '../helpers/meet-api.helper';
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

		test(`should hold only the encrypted name in the participantJoined webhook and the REST participants of an encrypted room, with the correlation fields in clear [${integration}]`, async ({
			page
		}) => {
			const { roomId: encryptedRoomId } = await createRoom({ config: { e2ee: { enabled: true } } });
			createdRoomIds.push(encryptedRoomId);
			const name = 'Secret Name';
			await openMeeting(page, encryptedRoomId, {
				integration,
				role: 'moderator',
				name,
				externalId: 'crm-user_42',
				metadata: '{"plan":"premium"}',
				e2eeKey: 'super-secret-key-123'
			});

			const webhook = await getWebhookFromStorage(page, encryptedRoomId, MeetWebhookEventType.PARTICIPANT_JOINED);
			const [restParticipant] = await listMeetingParticipants(encryptedRoomId);

			for (const participant of [(webhook.data as MeetParticipantJoinedPayload).participant, restParticipant]) {
				expect(participant.participantName).toBeTruthy();
				expect(participant.participantName).not.toContain(name);
				expect(participant.externalId).toBe('crm-user_42');
				expect(participant.metadata).toBe('{"plan":"premium"}');
			}
		});
	}
});
