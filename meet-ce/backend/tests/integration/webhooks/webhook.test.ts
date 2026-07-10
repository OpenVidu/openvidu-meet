import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
	MeetRecordingEncodingPreset,
	MeetRecordingInfo,
	MeetRecordingLayout,
	MeetRecordingStatus,
	MeetRoom,
	MeetRoomConfig,
	MeetRoomDeletionPolicyWithMeeting,
	MeetWebhookEvent,
	MeetWebhookEventType
} from '@openvidu-meet/typings';
import { Request, Response } from 'express';
import http from 'http';
import { WebhookEvent } from 'livekit-server-sdk';
import { container } from '../../../src/config/dependency-injector.config.js';
import { lkWebhookHandler } from '../../../src/controllers/livekit-webhook.controller.js';
import { MeetLock } from '../../../src/helpers/redis.helper.js';
import { LivekitWebhookService } from '../../../src/services/livekit-webhook.service.js';
import { MutexService } from '../../../src/services/mutex.service.js';
import { disconnectFakeParticipants } from '../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	deleteRoom,
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
import {
	ReceivedWebhook,
	waitForRecordingToStop,
	waitForRoomToDelete,
	waitForWebhookCount,
	waitForWebhookEvent
} from '../../helpers/wait-helpers.js';

describe('Webhook Integration Tests', () => {
	let receivedWebhooks: ReceivedWebhook[] = [];

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
		await deleteAllRooms();
		await deleteAllRecordings();
	});

	const expectValidSignature = (webhook: { headers: http.IncomingHttpHeaders; body: MeetWebhookEvent }) => {
		expect(webhook.headers['x-signature']).toBeDefined();
		expect(webhook.headers['x-timestamp']).toBeDefined();
	};

	describe('Webhook sending', () => {
		it('should not send webhooks when disabled', async () => {
			await updateWebhookConfig({
				enabled: false
			});

			await setupSingleRoom(true);

			expect(receivedWebhooks.length).toBe(0);
		});

		it('should send meeting_started webhook when room is created', async () => {
			const context = await setupSingleRoom(true);
			const roomData = context.room;

			// Wait for 'meetingStarted' webhook to be delivered
			const meetingStartedWebhook = await waitForWebhookEvent(
				receivedWebhooks,
				MeetWebhookEventType.MEETING_STARTED
			);
			expect(meetingStartedWebhook.body.data.roomId).toBe(roomData.roomId);
			expect(meetingStartedWebhook.body.creationDate).toBeLessThanOrEqual(Date.now());
			expect(meetingStartedWebhook.body.creationDate).toBeGreaterThanOrEqual(Date.now() - 3000);

			const room: MeetRoom = meetingStartedWebhook.body.data as MeetRoom;
			expect(room.roomId).toBe(roomData.roomId);
			expect(room.config).toEqual(defaultRoomConfig);

			expectValidSignature(meetingStartedWebhook);
		});

		it('should send meeting_ended webhook when meeting is closed', async () => {
			const context = await setupSingleRoom(true);
			const roomData = context.room;
			const moderatorToken = context.moderatorToken;

			// Close the room
			await endMeeting(roomData.roomId, moderatorToken);

			// Wait for 'meetingEnded' webhook to be delivered
			const meetingEndedWebhook = await waitForWebhookEvent(receivedWebhooks, MeetWebhookEventType.MEETING_ENDED);
			expect(meetingEndedWebhook.body.creationDate).toBeLessThanOrEqual(Date.now());
			expect(meetingEndedWebhook.body.creationDate).toBeGreaterThanOrEqual(Date.now() - 3000);

			const room: MeetRoom = meetingEndedWebhook.body.data as MeetRoom;
			expect(room.roomId).toBe(roomData.roomId);
			expect(room.config).toEqual(defaultRoomConfig);

			expectValidSignature(meetingEndedWebhook);
		});

		it('should send meeting_ended when room is forcefully deleted', async () => {
			const context = await setupSingleRoom(true);
			const roomData = context.room;
			// Forcefully delete the room
			await deleteRoom(roomData.roomId, { withMeeting: MeetRoomDeletionPolicyWithMeeting.FORCE });
			await waitForRoomToDelete(roomData.roomId); // Wait for the room deletion to be persisted
			// Wait for 'meetingEnded' webhook to be delivered
			const meetingEndedWebhook = await waitForWebhookEvent(receivedWebhooks, MeetWebhookEventType.MEETING_ENDED);
			expect(meetingEndedWebhook.body.data.roomId).toBe(roomData.roomId);
			expect(meetingEndedWebhook.body.creationDate).toBeLessThanOrEqual(Date.now());
			expect(meetingEndedWebhook.body.creationDate).toBeGreaterThanOrEqual(Date.now() - 3000);

			const room: MeetRoom = meetingEndedWebhook.body.data as MeetRoom;
			expect(room.roomId).toBe(roomData.roomId);
			expect(room.config).toEqual(defaultRoomConfig);

			expectValidSignature(meetingEndedWebhook);
		});

		it('should send recordingStarted, recordingUpdated and recordingEnded webhooks when recording is started and stopped', async () => {
			const startDate = Date.now();
			const context = await setupSingleRoomWithRecording(true, '2s');
			const roomData = context.room;
			const recordingId = context.recordingId;

			await waitForRecordingToStop(recordingId!); // Wait for the recording to stop and webhook to be processed

			// Wait for all 4 recording webhooks to be delivered (STARTED, ACTIVE, ENDING, COMPLETE)
			await waitForWebhookCount(receivedWebhooks, (w) => w.body.event.startsWith('recording'), 4, {
				errorMessage: 'Expected 4 recording webhooks (started, active, ending, complete)'
			});

			const recordingWebhooks = receivedWebhooks.filter((w) => w.body.event.startsWith('recording'));
			// STARTED, ACTIVE, ENDING, COMPLETE
			expect(recordingWebhooks.length).toBe(4);

			// Check recording_started webhook
			const recordingStartedWebhook = receivedWebhooks.find(
				(w) => w.body.event === MeetWebhookEventType.RECORDING_STARTED
			)!;

			let data = recordingStartedWebhook.body.data as MeetRecordingInfo;
			expect(data.roomId).toBe(roomData.roomId);
			expect(data.recordingId).toBe(recordingId);
			expect(recordingStartedWebhook.body.creationDate).toBeLessThan(Date.now());
			expect(recordingStartedWebhook.body.creationDate).toBeGreaterThan(startDate);

			expectValidSignature(recordingStartedWebhook);
			expect(recordingStartedWebhook.body.event).toBe(MeetWebhookEventType.RECORDING_STARTED);
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
			)!;
			data = recordingUpdatedWebhook.body.data as MeetRecordingInfo;
			expect(data.roomId).toBe(roomData.roomId);
			expect(data.recordingId).toBe(recordingId);
			expect(recordingUpdatedWebhook.body.creationDate).toBeLessThan(Date.now());
			expect(recordingUpdatedWebhook.body.creationDate).toBeGreaterThan(startDate);
			expectValidSignature(recordingUpdatedWebhook);
			expect(recordingUpdatedWebhook.body.event).toBe(MeetWebhookEventType.RECORDING_UPDATED);
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
			)!;
			data = recordingEndedWebhook.body.data as MeetRecordingInfo;
			expect(data.roomId).toBe(roomData.roomId);
			expect(data.recordingId).toBe(recordingId);
			expect(recordingEndedWebhook.body.creationDate).toBeLessThan(Date.now());
			expect(recordingEndedWebhook.body.creationDate).toBeGreaterThan(startDate);
			expectValidSignature(recordingEndedWebhook);
			expect(recordingEndedWebhook.body.event).toBe(MeetWebhookEventType.RECORDING_ENDED);
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

	describe('Webhook locking mechanism', () => {
		type WebhookReceiverLike = {
			receive: (body: string, auth?: string) => Promise<WebhookEvent>;
		};

		const createWebhookEvent = (id: string, roomName: string): WebhookEvent =>
			({
				id,
				event: 'room_started',
				room: {
					name: roomName,
					metadata: '{"openviduMeet": true}'
				}
			}) as unknown as WebhookEvent;

		const createMockRequest = (event: WebhookEvent): Request =>
			({
				body: JSON.stringify(event),
				get: (header: string) => (header === 'Authorization' ? 'Bearer test' : undefined)
			}) as unknown as Request;

		const createMockResponse = (): Response => {
			const response = {
				status: jest.fn().mockReturnThis(),
				send: jest.fn().mockReturnThis()
			};

			return response as unknown as Response;
		};

		const getWebhookReceiver = (livekitWebhookService: LivekitWebhookService): WebhookReceiverLike =>
			(livekitWebhookService as unknown as { webhookReceiver: WebhookReceiverLike }).webhookReceiver;

		afterEach(async () => {
			jest.restoreAllMocks();
		});

		it('should process the same webhook event only once when multiple requests are received concurrently', async () => {
			const livekitWebhookService = container.get(LivekitWebhookService);
			const mutexService = container.get(MutexService);
			const webhookEvent = createWebhookEvent('same-event-id', 'same-room');
			const lockKey = MeetLock.getWebhookLock(webhookEvent);

			const webhookReceiver = getWebhookReceiver(livekitWebhookService);

			jest.spyOn(webhookReceiver, 'receive').mockResolvedValue(webhookEvent);
			jest.spyOn(livekitWebhookService, 'webhookEventBelongsToOpenViduMeet').mockResolvedValue(true);

			const handleRoomStartedMock = jest
				.spyOn(livekitWebhookService, 'handleRoomStarted')
				.mockImplementation(async () => {
					await sleep('100ms');
				});

			// Simulate 8 concurrent requests with the same webhook event
			const concurrentRequests = Array.from({ length: 8 }, () =>
				lkWebhookHandler(createMockRequest(webhookEvent), createMockResponse())
			);

			await Promise.all(concurrentRequests);

			expect(handleRoomStartedMock).toHaveBeenCalledTimes(1);
			expect(await mutexService.lockExists(lockKey)).toBe(false);
		});

		it('should not block different webhook events from being processed concurrently', async () => {
			const livekitWebhookService = container.get(LivekitWebhookService);
			const mutexService = container.get(MutexService);
			const webhookEventA = createWebhookEvent('event-a', 'room-a');
			const webhookEventB = createWebhookEvent('event-b', 'room-b');
			const lockKeyA = MeetLock.getWebhookLock(webhookEventA);
			const lockKeyB = MeetLock.getWebhookLock(webhookEventB);

			const webhookReceiver = getWebhookReceiver(livekitWebhookService);

			jest.spyOn(webhookReceiver, 'receive').mockImplementation(
				async (body: string) => JSON.parse(body) as WebhookEvent
			);
			jest.spyOn(livekitWebhookService, 'webhookEventBelongsToOpenViduMeet').mockResolvedValue(true);

			const executions: Array<{ roomName: string; start: number; end: number }> = [];

			const handleRoomStartedMock = jest
				.spyOn(livekitWebhookService, 'handleRoomStarted')
				.mockImplementation(async (room) => {
					executions.push({ roomName: room.name, start: Date.now(), end: 0 });
					const entry = executions.find((execution) => execution.roomName === room.name)!;
					await sleep('300ms');
					entry.end = Date.now();
				});

			await Promise.all([
				lkWebhookHandler(createMockRequest(webhookEventA), createMockResponse()),
				lkWebhookHandler(createMockRequest(webhookEventB), createMockResponse())
			]);

			expect(handleRoomStartedMock).toHaveBeenCalledTimes(2);
			expect(executions.length).toBe(2);
			expect(executions[0].start).toBeLessThan(executions[1].end);
			expect(executions[1].start).toBeLessThan(executions[0].end);
			expect(await mutexService.lockExists(lockKeyA)).toBe(false);
			expect(await mutexService.lockExists(lockKeyB)).toBe(false);
		});

		it('should release locks properly after processing webhook events', async () => {
			const livekitWebhookService = container.get(LivekitWebhookService);
			const mutexService = container.get(MutexService);
			const webhookEvent = createWebhookEvent('releasable-event-id', 'release-room');
			const lockKey = MeetLock.getWebhookLock(webhookEvent);
			const registryKey = MeetLock.getRegistryLock(lockKey);

			const webhookReceiver = getWebhookReceiver(livekitWebhookService);

			jest.spyOn(webhookReceiver, 'receive').mockResolvedValue(webhookEvent);
			jest.spyOn(livekitWebhookService, 'webhookEventBelongsToOpenViduMeet').mockResolvedValue(true);
			const handleRoomStartedMock = jest.spyOn(livekitWebhookService, 'handleRoomStarted').mockResolvedValue();

			await lkWebhookHandler(createMockRequest(webhookEvent), createMockResponse());
			expect(await mutexService.lockExists(lockKey)).toBe(false);
			expect(await mutexService.lockRegistryExists(registryKey)).toBe(false);

			await lkWebhookHandler(createMockRequest(webhookEvent), createMockResponse());
			expect(handleRoomStartedMock).toHaveBeenCalledTimes(2);
			expect(await mutexService.lockExists(lockKey)).toBe(false);
			expect(await mutexService.lockRegistryExists(registryKey)).toBe(false);
		});

		it('should release lock once TTL expires without explicit release', async () => {
			const mutexService = container.get(MutexService);
			const webhookEvent = createWebhookEvent('ttl-expire-event-id', 'ttl-expire-room');
			const lockKey = MeetLock.getWebhookLock(webhookEvent);

			// Acquire with a short TTL (1s)
			const ttlMs = 1000;
			await mutexService.withLock(lockKey, ttlMs, async () => {
				// Do not call release; wait for TTL + small buffer
				await sleep('2s');

				// Trigger existence check which should cause registry cleanup for expired locks
				expect(await mutexService.lockExists(lockKey)).toBe(false);
			});
		});
	});

	// Regression guard for the webhook memory/fd leak: the handler MUST always send an
	// HTTP response. If any branch returns without responding, the LiveKit server keeps
	// the connection open forever (it has no delivery timeout), which pins the
	// request/response/socket graph in memory and leaks a file descriptor per webhook.
	// The bug: the "event does not belong to OpenVidu Meet" branch returned without a
	// response, so plain LiveKit-API usage (rooms not created through Meet) leaked.
	describe('Webhook handler always responds (no hung connections)', () => {
		const createWebhookEvent = (id: string, roomName: string, belongsToMeet: boolean): WebhookEvent =>
			({
				id,
				event: 'room_started',
				room: {
					name: roomName,
					metadata: belongsToMeet ? '{"openviduMeet": true}' : '{}'
				}
			}) as unknown as WebhookEvent;

		const createMockRequest = (event: WebhookEvent): Request =>
			({
				body: JSON.stringify(event),
				get: (header: string) => (header === 'Authorization' ? 'Bearer test' : undefined)
			}) as unknown as Request;

		const createMockResponse = () => ({
			status: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis()
		});

		const getWebhookReceiver = (service: LivekitWebhookService) =>
			(
				service as unknown as {
					webhookReceiver: { receive: (body: string, auth?: string) => Promise<WebhookEvent> };
				}
			).webhookReceiver;

		const expectResponseSent = (res: ReturnType<typeof createMockResponse>) => {
			// A 200 must be sent so the underlying HTTP connection can be released.
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.send).toHaveBeenCalled();
		};

		afterEach(() => {
			jest.restoreAllMocks();
		});

		it('responds 200 when the event does NOT belong to OpenVidu Meet (leak regression)', async () => {
			const service = container.get(LivekitWebhookService);
			const event = createWebhookEvent('external-event', 'external-room', false);

			jest.spyOn(getWebhookReceiver(service), 'receive').mockResolvedValue(event);
			jest.spyOn(service, 'webhookEventBelongsToOpenViduMeet').mockResolvedValue(false);
			const handleRoomStartedSpy = jest.spyOn(service, 'handleRoomStarted');

			const res = createMockResponse();
			await lkWebhookHandler(createMockRequest(event), res as unknown as Response);

			expectResponseSent(res);
			// Events for rooms Meet does not own must be skipped, but still acknowledged.
			expect(handleRoomStartedSpy).not.toHaveBeenCalled();
		});

		it('responds 200 when the event belongs to OpenVidu Meet and is processed', async () => {
			const service = container.get(LivekitWebhookService);
			const event = createWebhookEvent('meet-event', 'meet-room', true);

			jest.spyOn(getWebhookReceiver(service), 'receive').mockResolvedValue(event);
			jest.spyOn(service, 'webhookEventBelongsToOpenViduMeet').mockResolvedValue(true);
			jest.spyOn(service, 'handleRoomStarted').mockResolvedValue();

			const res = createMockResponse();
			await lkWebhookHandler(createMockRequest(event), res as unknown as Response);

			expectResponseSent(res);
		});

		it('responds 200 when webhook signature verification fails', async () => {
			const service = container.get(LivekitWebhookService);

			jest.spyOn(getWebhookReceiver(service), 'receive').mockRejectedValue(new Error('invalid signature'));

			const res = createMockResponse();
			await lkWebhookHandler(
				createMockRequest({ id: 'bad-signature' } as unknown as WebhookEvent),
				res as unknown as Response
			);

			expectResponseSent(res);
		});

		it('responds 200 even when event processing throws', async () => {
			const service = container.get(LivekitWebhookService);
			const event = createWebhookEvent('failing-event', 'failing-room', true);

			jest.spyOn(getWebhookReceiver(service), 'receive').mockResolvedValue(event);
			jest.spyOn(service, 'webhookEventBelongsToOpenViduMeet').mockResolvedValue(true);
			jest.spyOn(service, 'handleRoomStarted').mockRejectedValue(new Error('processing boom'));

			const res = createMockResponse();
			await lkWebhookHandler(createMockRequest(event), res as unknown as Response);

			expectResponseSent(res);
		});
	});
});
