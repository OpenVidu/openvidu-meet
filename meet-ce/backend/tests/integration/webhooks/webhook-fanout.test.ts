import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { MeetParticipantJoinedPayload, MeetRoom } from '@openvidu-meet/typings';
import { MeetWebhookEventType } from '@openvidu-meet/typings';
import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import { container } from '../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG, setInternalConfig } from '../../../src/config/internal-config.js';
import { WebhookDispatcherService } from '../../../src/services/webhook-dispatcher.service.js';
import { createWebhook, deleteAllWebhooks, sleep, startTestServer } from '../../helpers/request-helpers.js';
import type { ReceivedWebhook } from '../../helpers/wait-helpers.js';
import { waitForWebhookEvent } from '../../helpers/wait-helpers.js';

/**
 * Delivery fan-out tests: they invoke the dispatcher directly (the LiveKit pipeline is exercised by
 * webhook.test.ts) and assert how one event spreads over the registered webhooks — every matching
 * endpoint gets it, filters and scopes are honored, and one endpoint being down never affects the
 * others.
 */

interface WebhookReceiver {
	url: string;
	received: ReceivedWebhook[];
	close: () => Promise<void>;
}

const startReceiver = async (): Promise<WebhookReceiver> => {
	const app = express();
	app.use(express.json());

	const received: ReceivedWebhook[] = [];

	app.post('/hook', (req: Request, res: Response) => {
		received.push({ headers: req.headers, body: req.body });
		res.status(200).send({ success: true });
	});

	const server = await new Promise<http.Server>((resolve) => {
		const listening: http.Server = app.listen(0, () => resolve(listening));
	});
	const { port } = server.address() as AddressInfo;

	return {
		url: `http://localhost:${port}/hook`,
		received,
		close: () => new Promise((resolve) => server.close(() => resolve()))
	};
};

// Nothing listens on port 9 (discard); connections are refused immediately
const DEAD_ENDPOINT_URL = 'http://127.0.0.1:9/hook';

const buildRoom = (roomId: string): MeetRoom => ({ roomId, roomName: roomId }) as MeetRoom;

const buildParticipantJoinedPayload = (roomId: string): MeetParticipantJoinedPayload =>
	({
		roomId,
		roomName: roomId,
		participant: { participantIdentity: 'participant-1' }
	}) as MeetParticipantJoinedPayload;

describe('Webhook Fan-out Integration Tests', () => {
	let dispatcher: WebhookDispatcherService;
	let receiverA: WebhookReceiver;
	let receiverB: WebhookReceiver;

	const originalRetryConfig = {
		WEBHOOK_RETRY_ATTEMPTS: INTERNAL_CONFIG.WEBHOOK_RETRY_ATTEMPTS,
		WEBHOOK_RETRY_INITIAL_DELAY: INTERNAL_CONFIG.WEBHOOK_RETRY_INITIAL_DELAY,
		WEBHOOK_REQUEST_TIMEOUT: INTERNAL_CONFIG.WEBHOOK_REQUEST_TIMEOUT
	};

	beforeAll(async () => {
		await startTestServer();
		dispatcher = container.get(WebhookDispatcherService);

		// Keep the failing-endpoint tests fast: one quick retry instead of the production backoff
		setInternalConfig({
			WEBHOOK_RETRY_ATTEMPTS: 1,
			WEBHOOK_RETRY_INITIAL_DELAY: 50,
			WEBHOOK_REQUEST_TIMEOUT: 2000
		});

		receiverA = await startReceiver();
		receiverB = await startReceiver();
	});

	beforeEach(async () => {
		receiverA.received.length = 0;
		receiverB.received.length = 0;
		await deleteAllWebhooks();
	});

	afterAll(async () => {
		setInternalConfig(originalRetryConfig);
		await deleteAllWebhooks();
		await receiverA.close();
		await receiverB.close();
	});

	it('should deliver an event to every registered webhook that matches it', async () => {
		await createWebhook({ url: receiverA.url });
		await createWebhook({ url: receiverB.url });

		dispatcher.sendMeetingStartedWebhook(buildRoom('fanout-room'));

		await waitForWebhookEvent(receiverA.received, MeetWebhookEventType.MEETING_STARTED, {
			roomId: 'fanout-room'
		});
		await waitForWebhookEvent(receiverB.received, MeetWebhookEventType.MEETING_STARTED, {
			roomId: 'fanout-room'
		});
	});

	it('should share one envelope and signature across endpoints', async () => {
		await createWebhook({ url: receiverA.url });
		await createWebhook({ url: receiverB.url });

		dispatcher.sendMeetingStartedWebhook(buildRoom('signature-room'));

		const webhookA = await waitForWebhookEvent(receiverA.received, MeetWebhookEventType.MEETING_STARTED);
		const webhookB = await waitForWebhookEvent(receiverB.received, MeetWebhookEventType.MEETING_STARTED);

		expect(webhookA.headers['x-signature']).toBeDefined();
		expect(webhookA.headers['x-signature']).toBe(webhookB.headers['x-signature']);
		expect(webhookA.headers['x-timestamp']).toBe(webhookB.headers['x-timestamp']);
		expect(webhookA.body).toEqual(webhookB.body);
	});

	it('should honor the event type filter of each webhook', async () => {
		await createWebhook({ url: receiverA.url, events: [MeetWebhookEventType.PARTICIPANT_JOINED] });
		await createWebhook({ url: receiverB.url, events: [MeetWebhookEventType.MEETING_STARTED] });

		dispatcher.sendMeetingStartedWebhook(buildRoom('filter-room'));
		await waitForWebhookEvent(receiverB.received, MeetWebhookEventType.MEETING_STARTED);
		expect(receiverA.received.length).toBe(0);

		dispatcher.sendParticipantJoinedWebhook(buildParticipantJoinedPayload('filter-room'));
		await waitForWebhookEvent(receiverA.received, MeetWebhookEventType.PARTICIPANT_JOINED);
		expect(
			receiverB.received.filter((webhook) => webhook.body.event !== MeetWebhookEventType.MEETING_STARTED)
		).toEqual([]);
	});

	it('should honor the room scope of each webhook', async () => {
		await createWebhook({ url: receiverA.url, roomId: 'room-a' });
		await createWebhook({ url: receiverB.url, roomId: 'room-b' });

		dispatcher.sendMeetingStartedWebhook(buildRoom('room-b'));

		await waitForWebhookEvent(receiverB.received, MeetWebhookEventType.MEETING_STARTED, { roomId: 'room-b' });
		expect(receiverA.received.length).toBe(0);
	});

	it('should not deliver anything to a disabled webhook', async () => {
		await createWebhook({ url: receiverA.url, enabled: false });
		await createWebhook({ url: receiverB.url });

		dispatcher.sendMeetingStartedWebhook(buildRoom('disabled-room'));

		await waitForWebhookEvent(receiverB.received, MeetWebhookEventType.MEETING_STARTED);
		// The delivery to B completed, so a delivery to A would already have been attempted
		await sleep('250ms');
		expect(receiverA.received.length).toBe(0);
	});

	it('should keep delivering to healthy endpoints while another endpoint is down', async () => {
		await createWebhook({ url: DEAD_ENDPOINT_URL });
		await createWebhook({ url: receiverB.url });

		dispatcher.sendMeetingStartedWebhook(buildRoom('isolation-room'));

		await waitForWebhookEvent(receiverB.received, MeetWebhookEventType.MEETING_STARTED, {
			roomId: 'isolation-room'
		});
	});

	it('should keep events flowing after an event whose every delivery failed', async () => {
		await createWebhook({ url: DEAD_ENDPOINT_URL });
		dispatcher.sendMeetingStartedWebhook(buildRoom('all-down-room'));

		// Give the failed delivery (1 retry, 50ms backoff) time to exhaust its attempts
		await sleep('500ms');

		await deleteAllWebhooks();
		await createWebhook({ url: receiverB.url });
		dispatcher.sendMeetingEndedWebhook(buildRoom('recovered-room'));

		await waitForWebhookEvent(receiverB.received, MeetWebhookEventType.MEETING_ENDED, {
			roomId: 'recovered-room'
		});
	});
});
