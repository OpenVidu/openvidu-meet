import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import {
	MeetRecordingEncodingPreset,
	MeetRecordingInfo,
	MeetRecordingLayout,
	MeetRecordingStatus,
	MeetRoom,
	MeetRoomConfig,
	MeetWebhookEvent,
	MeetWebhookEventType
} from '@openvidu-meet/typings';
import { Request } from 'express';
import http from 'http';
import {
	deleteAllRecordings,
	deleteAllRooms,
	deleteRoom,
	disconnectFakeParticipants,
	endMeeting,
	restoreDefaultGlobalConfig,
	sleep,
	startTestServer,
	updateWebhookConfig
} from '../../helpers/request-helpers.js';
import {
	setupSingleRoom,
	setupSingleRoomWithRecording,
	startWebhookServer,
	stopWebhookServer
} from '../../helpers/test-scenarios.js';

describe('Webhook Integration Tests', () => {
	let receivedWebhooks: { headers: http.IncomingHttpHeaders; body: MeetWebhookEvent }[] = [];

	const defaultRoomConfig: MeetRoomConfig = {
		recording: {
			enabled: true,
			layout: MeetRecordingLayout.GRID,
			encoding: MeetRecordingEncodingPreset.H264_720P_30
		},
		chat: { enabled: true },
		virtualBackground: { enabled: true },
		e2ee: { enabled: false },
		captions: { enabled: true }
	};

	beforeAll(async () => {
		await startTestServer();

		// Start test server for webhooks
		await startWebhookServer(5080, (req: Request) => {
			receivedWebhooks.push({
				headers: req.headers,
				body: req.body
			});
		});
	});

	beforeEach(async () => {
		receivedWebhooks = [];
		// Enable webhooks in global config
		await updateWebhookConfig({
			enabled: true,
			url: `http://localhost:5080/webhook`
		});
	});

	afterAll(async () => {
		await stopWebhookServer();
		await restoreDefaultGlobalConfig();

		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	const expectValidSignature = (webhook: { headers: http.IncomingHttpHeaders; body: MeetWebhookEvent }) => {
		expect(webhook.headers['x-signature']).toBeDefined();
		expect(webhook.headers['x-timestamp']).toBeDefined();
	};

	it('should not send webhooks when disabled', async () => {
		await updateWebhookConfig({
			enabled: false
		});

		await setupSingleRoom(true);

		// Wait for the room to be created
		await sleep('3s');
		expect(receivedWebhooks.length).toBe(0);
	});

	it('should send meeting_started webhook when room is created', async () => {
		const context = await setupSingleRoom(true);
		const roomData = context.room;

		// Wait for the room to be created
		await sleep('1s');

		// Verify 'meetingStarted' webhook is sent
		expect(receivedWebhooks.length).toBeGreaterThanOrEqual(1);
		const meetingStartedWebhook = receivedWebhooks.find(
			(w) => w.body.event === MeetWebhookEventType.MEETING_STARTED
		);
		expect(meetingStartedWebhook).toBeDefined();
		expect(meetingStartedWebhook?.body.data.roomId).toBe(roomData.roomId);
		expect(meetingStartedWebhook?.body.creationDate).toBeLessThanOrEqual(Date.now());
		expect(meetingStartedWebhook?.body.creationDate).toBeGreaterThanOrEqual(Date.now() - 3000);

		const room: MeetRoom = meetingStartedWebhook!.body.data as MeetRoom;
		expect(room.roomId).toBe(roomData.roomId);
		expect(room.config).toEqual(defaultRoomConfig);

		expectValidSignature(meetingStartedWebhook!);
	});

	it('should send meeting_ended webhook when meeting is closed', async () => {
		const context = await setupSingleRoom(true);
		const roomData = context.room;
		const moderatorToken = context.moderatorToken;

		// Close the room
		await endMeeting(roomData.roomId, moderatorToken);

		// Wait for the room to be closed
		await sleep('1s');

		// Verify 'meetingEnded' webhook is sent
		expect(receivedWebhooks.length).toBeGreaterThanOrEqual(1);
		const meetingEndedWebhook = receivedWebhooks.find((w) => w.body.event === MeetWebhookEventType.MEETING_ENDED);
		expect(meetingEndedWebhook).toBeDefined();
		expect(meetingEndedWebhook?.body.creationDate).toBeLessThanOrEqual(Date.now());
		expect(meetingEndedWebhook?.body.creationDate).toBeGreaterThanOrEqual(Date.now() - 3000);

		const room: MeetRoom = meetingEndedWebhook!.body.data as MeetRoom;
		expect(room.roomId).toBe(roomData.roomId);
		expect(room.config).toEqual(defaultRoomConfig);

		expectValidSignature(meetingEndedWebhook!);
	});

	it('should send meeting_ended when room is forcefully deleted', async () => {
		const context = await setupSingleRoom(true);
		const roomData = context.room;
		// Forcefully delete the room
		await deleteRoom(roomData.roomId, { withMeeting: 'force' });

		// Verify 'meetingEnded' webhook is sent
		expect(receivedWebhooks.length).toBeGreaterThanOrEqual(1);
		const meetingEndedWebhook = receivedWebhooks.find((w) => w.body.event === MeetWebhookEventType.MEETING_ENDED);
		expect(meetingEndedWebhook).toBeDefined();
		expect(meetingEndedWebhook?.body.data.roomId).toBe(roomData.roomId);
		expect(meetingEndedWebhook?.body.creationDate).toBeLessThanOrEqual(Date.now());
		expect(meetingEndedWebhook?.body.creationDate).toBeGreaterThanOrEqual(Date.now() - 3000);

		const room: MeetRoom = meetingEndedWebhook!.body.data as MeetRoom;
		expect(room.roomId).toBe(roomData.roomId);
		expect(room.config).toEqual(defaultRoomConfig);

		expectValidSignature(meetingEndedWebhook!);
	});

	it('should send recordingStarted, recordingUpdated and recordingEnded webhooks when recording is started and stopped', async () => {
		const startDate = Date.now();
		const context = await setupSingleRoomWithRecording(true, '2s');
		const roomData = context.room;
		const recordingId = context.recordingId;

		const recordingWebhooks = receivedWebhooks.filter((w) => w.body.event.startsWith('recording'));
		// STARTED, ACTIVE, ENDING, COMPLETE
		expect(recordingWebhooks.length).toBe(4);

		// Check recording_started webhook
		const recordingStartedWebhook = receivedWebhooks.find(
			(w) => w.body.event === MeetWebhookEventType.RECORDING_STARTED
		);

		let data = recordingStartedWebhook?.body.data as MeetRecordingInfo;
		expect(recordingStartedWebhook).toBeDefined();
		expect(data.roomId).toBe(roomData.roomId);
		expect(data.recordingId).toBe(recordingId);
		expect(recordingStartedWebhook?.body.creationDate).toBeLessThan(Date.now());
		expect(recordingStartedWebhook?.body.creationDate).toBeGreaterThan(startDate);

		expectValidSignature(recordingStartedWebhook!);
		expect(recordingStartedWebhook?.body.event).toBe(MeetWebhookEventType.RECORDING_STARTED);
		expect(data.status).toBe(MeetRecordingStatus.STARTING);
		expect(data.layout).toBeDefined();

		if (data.layout) {
			expect(Object.values(MeetRecordingLayout)).toContain(data.layout);
		}

		// Validate encoding is present and coherent with default value
		expect(data.encoding).toBeDefined();
		expect(data.encoding).toBe(MeetRecordingEncodingPreset.H264_720P_30);
		// Check recording_updated webhook
		const recordingUpdatedWebhook = receivedWebhooks.find(
			(w) => w.body.event === MeetWebhookEventType.RECORDING_UPDATED
		);
		data = recordingUpdatedWebhook?.body.data as MeetRecordingInfo;
		expect(recordingUpdatedWebhook).toBeDefined();
		expect(data.roomId).toBe(roomData.roomId);
		expect(data.recordingId).toBe(recordingId);
		expect(recordingUpdatedWebhook?.body.creationDate).toBeLessThan(Date.now());
		expect(recordingUpdatedWebhook?.body.creationDate).toBeGreaterThan(startDate);
		expectValidSignature(recordingUpdatedWebhook!);
		expect(recordingUpdatedWebhook?.body.event).toBe(MeetWebhookEventType.RECORDING_UPDATED);
		expect(data.status).toBe(MeetRecordingStatus.ACTIVE);
		expect(data.layout).toBeDefined();

		if (data.layout) {
			expect(Object.values(MeetRecordingLayout)).toContain(data.layout);
		}

		// Validate encoding is present and coherent with default value
		expect(data.encoding).toBeDefined();
		expect(data.encoding).toBe('H264_720P_30');

		// Check recording_ended webhook
		const recordingEndedWebhook = receivedWebhooks.find(
			(w) => w.body.event === MeetWebhookEventType.RECORDING_ENDED
		);
		data = recordingEndedWebhook?.body.data as MeetRecordingInfo;
		expect(recordingEndedWebhook).toBeDefined();
		expect(data.roomId).toBe(roomData.roomId);
		expect(data.recordingId).toBe(recordingId);
		expect(recordingEndedWebhook?.body.creationDate).toBeLessThan(Date.now());
		expect(recordingEndedWebhook?.body.creationDate).toBeGreaterThan(startDate);
		expectValidSignature(recordingEndedWebhook!);
		expect(recordingEndedWebhook?.body.event).toBe(MeetWebhookEventType.RECORDING_ENDED);
		expect(data.status).not.toBe(MeetRecordingStatus.ENDING);
		expect(data.status).toBe(MeetRecordingStatus.COMPLETE);
		expect(data.layout).toBeDefined();

		if (data.layout) {
			expect(Object.values(MeetRecordingLayout)).toContain(data.layout);
		}

		// Validate encoding is present and coherent with default value
		expect(data.encoding).toBeDefined();
		expect(data.encoding).toBe('H264_720P_30');
	});
});
