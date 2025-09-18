import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { Request } from 'express';
import http from 'http';
import { container } from '../../../src/config/dependency-injector.config.js';
import { MeetStorageService } from '../../../src/services/index.js';
import { MeetRecordingInfo, MeetRecordingStatus } from '../../../src/typings/ce/recording.model.js';
import { MeetWebhookEvent, MeetWebhookEventType } from '../../../src/typings/ce/webhook.model.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	deleteRoom,
	disconnectFakeParticipants,
	endMeeting,
	sleep,
	startTestServer,
	updateWebbhookConfig
} from '../../helpers/request-helpers.js';
import {
	setupSingleRoom,
	setupSingleRoomWithRecording,
	startWebhookServer,
	stopWebhookServer
} from '../../helpers/test-scenarios.js';

describe('Webhook Integration Tests', () => {
	let receivedWebhooks: { headers: http.IncomingHttpHeaders; body: MeetWebhookEvent }[] = [];
	let storageService: MeetStorageService;

	beforeAll(async () => {
		startTestServer();
		storageService = container.get(MeetStorageService);

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
		await updateWebbhookConfig({
			enabled: true,
			url: `http://localhost:5080/webhook`
		});
	});

	afterAll(async () => {
		await stopWebhookServer();
		await storageService['initializeGlobalConfig']();

		await disconnectFakeParticipants();
		await Promise.all([deleteAllRooms(), deleteAllRecordings()]);
	});

	it('should not send webhooks when disabled', async () => {
		await updateWebbhookConfig({
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
		expect(meetingStartedWebhook?.headers['x-signature']).toBeDefined();
		expect(meetingStartedWebhook?.headers['x-timestamp']).toBeDefined();
	});

	it('should send meeting_ended webhook when meeting is closed', async () => {
		const context = await setupSingleRoom(true);
		const roomData = context.room;
		const moderatorCookie = context.moderatorCookie;

		// Close the room
		await endMeeting(roomData.roomId, moderatorCookie);

		// Wait for the room to be closed
		await sleep('1s');

		// Verify 'meetingEnded' webhook is sent
		expect(receivedWebhooks.length).toBeGreaterThanOrEqual(1);
		const meetingEndedWebhook = receivedWebhooks.find((w) => w.body.event === MeetWebhookEventType.MEETING_ENDED);
		expect(meetingEndedWebhook).toBeDefined();
		expect(meetingEndedWebhook?.body.data.roomId).toBe(roomData.roomId);
		expect(meetingEndedWebhook?.body.creationDate).toBeLessThanOrEqual(Date.now());
		expect(meetingEndedWebhook?.body.creationDate).toBeGreaterThanOrEqual(Date.now() - 3000);
		expect(meetingEndedWebhook?.headers['x-signature']).toBeDefined();
		expect(meetingEndedWebhook?.headers['x-timestamp']).toBeDefined();
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
		expect(meetingEndedWebhook?.headers['x-signature']).toBeDefined();
		expect(meetingEndedWebhook?.headers['x-timestamp']).toBeDefined();
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
		expect(recordingStartedWebhook?.headers['x-signature']).toBeDefined();
		expect(recordingStartedWebhook?.headers['x-timestamp']).toBeDefined();
		expect(recordingStartedWebhook?.body.event).toBe(MeetWebhookEventType.RECORDING_STARTED);
		expect(data.status).toBe(MeetRecordingStatus.STARTING);

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
		expect(recordingUpdatedWebhook?.headers['x-signature']).toBeDefined();
		expect(recordingUpdatedWebhook?.headers['x-timestamp']).toBeDefined();
		expect(recordingUpdatedWebhook?.body.event).toBe(MeetWebhookEventType.RECORDING_UPDATED);
		expect(data.status).toBe(MeetRecordingStatus.ACTIVE);

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
		expect(recordingEndedWebhook?.headers['x-signature']).toBeDefined();
		expect(recordingEndedWebhook?.headers['x-timestamp']).toBeDefined();
		expect(recordingEndedWebhook?.body.event).toBe(MeetWebhookEventType.RECORDING_ENDED);
		expect(data.status).not.toBe(MeetRecordingStatus.ENDING);
		expect(data.status).toBe(MeetRecordingStatus.COMPLETE);
	});
});
