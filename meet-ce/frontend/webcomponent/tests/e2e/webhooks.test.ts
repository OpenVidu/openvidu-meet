import {
	LeftEventReason,
	MeetParticipantJoinedPayload,
	MeetParticipantLeftPayload,
	MeetRecordingInfo,
	MeetRoomMemberRole,
	MeetRoomStatus,
	MeetWebhookEventType
} from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { createRoom, deleteRooms, getRecording, getRoom } from '../helpers/meet-api.helper';
import { startRecording, stopRecording } from '../helpers/recordings.helper';
import { endMeetingCommand, expectWebhook, leaveMeeting, openMeeting } from '../helpers/testapp.helper';
import { getWebhookFromStorage } from '../helpers/ui-utils.helper';

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

	test('should receive meetingStarted and meetingEnded webhooks', async ({ page }) => {
		await openMeeting(page, roomId, { role: 'moderator' });

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

	test('should receive participantJoined and participantLeft webhooks for a participant that joins and leaves', async ({
		page,
		browser
	}) => {
		await openMeeting(page, roomId, { role: 'moderator' });
		await expectWebhook(page, MeetWebhookEventType.MEETING_STARTED);

		const speakerContext = await browser.newContext();
		const speakerPage = await speakerContext.newPage();
		const speakerName = 'Speaker';
		const speakerExternalId = 'crm-user_42';
		const speakerMetadata = '{"department": "cardiology"}';
		await openMeeting(speakerPage, roomId, {
			role: 'speaker',
			name: speakerName,
			externalId: speakerExternalId,
			metadata: speakerMetadata
		});

		// The moderator's own join also fires a participantJoined webhook, so the speaker's is the
		// second one delivered for this room. Both pages observe the same broadcast (the webhook
		// bridge has no room scoping), so read everything from the moderator's page.
		await expectWebhook(page, MeetWebhookEventType.PARTICIPANT_JOINED, { count: 2 });
		const participantJoinedWebhook = await getWebhookFromStorage(
			page,
			roomId,
			MeetWebhookEventType.PARTICIPANT_JOINED,
			{ matchIndex: 1 }
		);
		const joinedPayload = participantJoinedWebhook.data as MeetParticipantJoinedPayload;
		expect(joinedPayload.roomId).toBe(roomId);
		expect(joinedPayload.participant.participantName).toBe(speakerName);
		expect(joinedPayload.participant.role).toBe(MeetRoomMemberRole.SPEAKER);
		expect(joinedPayload.participant.joinDate).toBeLessThanOrEqual(Date.now());
		// The app-provided correlation fields ride the whole pipeline: embed attribute -> join
		// request -> token metadata -> LiveKit participant -> webhook payload.
		expect(joinedPayload.participant.externalId).toBe(speakerExternalId);
		expect(joinedPayload.participant.metadata).toBe(speakerMetadata);

		await leaveMeeting(speakerPage, { role: 'speaker' });

		await expectWebhook(page, MeetWebhookEventType.PARTICIPANT_LEFT);
		const participantLeftWebhook = await getWebhookFromStorage(page, roomId, MeetWebhookEventType.PARTICIPANT_LEFT);
		const leftPayload = participantLeftWebhook.data as MeetParticipantLeftPayload;
		expect(leftPayload.roomId).toBe(roomId);
		expect(leftPayload.participant.participantName).toBe(speakerName);
		expect(leftPayload.participant.leaveReason).toBe(LeftEventReason.VOLUNTARY_LEAVE);
		expect(leftPayload.participant.durationSeconds).toBeGreaterThanOrEqual(0);
		expect(leftPayload.participant.externalId).toBe(speakerExternalId);
		expect(leftPayload.participant.metadata).toBe(speakerMetadata);

		await speakerContext.close();
	});

	test('should receive recordingStarted, recordingUpdated and recordingEnded webhooks', async ({ page }) => {
		await openMeeting(page, roomId, { role: 'moderator' });

		await startRecording(page);
		await expectWebhook(page, MeetWebhookEventType.RECORDING_STARTED);

		const recordingStartedWebhook = await getWebhookFromStorage(
			page,
			roomId,
			MeetWebhookEventType.RECORDING_STARTED
		);
		expect(recordingStartedWebhook.event).toBe(MeetWebhookEventType.RECORDING_STARTED);
		expect(recordingStartedWebhook.data).toBeDefined();

		const recordingId = (recordingStartedWebhook.data as MeetRecordingInfo).recordingId;
		expect(recordingId).toBeDefined();

		const actualRecording = await getRecording(recordingId);
		expect(recordingStartedWebhook.data).toMatchObject({
			...actualRecording,
			startDate: expect.any(Number),
			status: expect.stringMatching(/active|starting/)
		});

		await expectWebhook(page, MeetWebhookEventType.RECORDING_UPDATED);

		const recordingUpdatedWebhook = await getWebhookFromStorage(
			page,
			roomId,
			MeetWebhookEventType.RECORDING_UPDATED
		);
		expect(recordingUpdatedWebhook.event).toBe(MeetWebhookEventType.RECORDING_UPDATED);
		expect(recordingUpdatedWebhook.data).toBeDefined();
		expect((recordingUpdatedWebhook.data as MeetRecordingInfo).recordingId).toBe(recordingId);

		const updatedRecording = await getRecording(recordingId);
		expect(recordingUpdatedWebhook.data).toMatchObject(updatedRecording as any);

		await stopRecording(page);
		await expectWebhook(page, MeetWebhookEventType.RECORDING_ENDED);

		const recordingEndedWebhook = await getWebhookFromStorage(page, roomId, MeetWebhookEventType.RECORDING_ENDED);
		expect(recordingEndedWebhook.event).toBe(MeetWebhookEventType.RECORDING_ENDED);
		expect(recordingEndedWebhook.data).toBeDefined();
		expect((recordingEndedWebhook.data as MeetRecordingInfo).recordingId).toBe(recordingId);

		const endedRecording = await getRecording(recordingId);
		expect(recordingEndedWebhook.data).toMatchObject(endedRecording as any);
	});
});
