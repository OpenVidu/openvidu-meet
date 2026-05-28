import { MeetRecordingInfo, MeetRoomStatus, MeetWebhookEventType } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { createRoom, deleteRooms, getRecording, getRoom } from '../helpers/meet-api.helper';
import { startRecording, stopRecording } from '../helpers/recordings.helper';
import { endMeetingCommand, expectWebhook, openMeeting } from '../helpers/testapp.helper';
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

	test('should successfully receive meetingStarted and meetingEnded webhooks', async ({ page }) => {
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

	test('should successfully receive recordingStarted, recordingUpdated and recordingEnded webhooks', async ({
		page
	}) => {
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
