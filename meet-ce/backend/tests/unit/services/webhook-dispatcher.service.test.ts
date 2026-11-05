import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import crypto from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import { MeetBroadcastStatus, MeetMeetingEndedReason, MeetWebhookEventType } from '@openvidu-meet/typings';
import type { MeetBroadcastInfo, MeetRoom, MeetWebhook, MeetWebhookPayload } from '@openvidu-meet/typings';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG, setInternalConfig } from '../../../src/config/internal-config.js';
import { WebhookDispatcherService } from '../../../src/services/webhook-dispatcher.service.js';

class TestableWebhookDispatcherService extends WebhookDispatcherService {
	calls: { event: MeetWebhookEventType; payload: MeetWebhookPayload }[] = [];

	protected override sendWebhookEventInBackground(event: MeetWebhookEventType, payload: MeetWebhookPayload): void {
		this.calls.push({ event, payload });
	}
}

const buildService = () =>
	new TestableWebhookDispatcherService(
		...([{}, {}, {}] as unknown as ConstructorParameters<typeof WebhookDispatcherService>)
	);

const fakeRoom = { roomId: 'room-1', roomName: 'Room 1' } as MeetRoom;

/**
 * C7 (MEET-BRANCH-AUDIT-FINDINGS.md): reason is additive on the meetingEnded payload: absent for
 * every end path except the one that actually needs it (a force-end by the duration GC), so every
 * other integrator's parsing of this event is unaffected.
 */
describe('WebhookDispatcherService broadcast webhooks', () => {
	it('sends each change of a broadcast as its own event, carrying the broadcast as it is', () => {
		const service = buildService();
		const broadcast = (status: MeetBroadcastStatus) =>
			({
				broadcastId: 'room-1--Qm4tZ8vR1c',
				roomId: 'room-1',
				status,
				destination: { id: 'kX9pL2mQ7a', name: 'YouTube', url: 'rtmp://a.rtmp.youtube.com/live2/********' }
			}) as MeetBroadcastInfo;

		service.sendBroadcastStartedWebhook(broadcast(MeetBroadcastStatus.STARTING));
		service.sendBroadcastUpdatedWebhook(broadcast(MeetBroadcastStatus.ACTIVE));
		service.sendBroadcastEndedWebhook(broadcast(MeetBroadcastStatus.COMPLETE));

		expect(service.calls).toEqual([
			{ event: MeetWebhookEventType.BROADCAST_STARTED, payload: broadcast(MeetBroadcastStatus.STARTING) },
			{ event: MeetWebhookEventType.BROADCAST_UPDATED, payload: broadcast(MeetBroadcastStatus.ACTIVE) },
			{ event: MeetWebhookEventType.BROADCAST_ENDED, payload: broadcast(MeetBroadcastStatus.COMPLETE) }
		]);
	});
});

describe('WebhookDispatcherService.sendMeetingEndedWebhook (C7: additive reason field)', () => {
	it('omits reason entirely for a normal end', () => {
		const service = buildService();

		service.sendMeetingEndedWebhook(fakeRoom);

		expect(service.calls).toEqual([{ event: MeetWebhookEventType.MEETING_ENDED, payload: fakeRoom }]);
		expect('reason' in service.calls[0].payload).toBe(false);
	});

	it('includes reason when the meeting was force-ended by the duration GC', () => {
		const service = buildService();

		service.sendMeetingEndedWebhook(fakeRoom, MeetMeetingEndedReason.MAX_DURATION_REACHED);

		expect(service.calls).toEqual([
			{
				event: MeetWebhookEventType.MEETING_ENDED,
				payload: { ...fakeRoom, reason: MeetMeetingEndedReason.MAX_DURATION_REACHED }
			}
		]);
	});
});

describe('WebhookDispatcherService event types', () => {
	const participantPayload = {
		roomId: 'room-1',
		roomName: 'Room 1',
		participant: { participantIdentity: 'speaker-1' }
	} as never;
	const recording = { recordingId: 'room-1--EG_1--abc', roomId: 'room-1' } as never;

	it.each([
		['meetingStarted', (s: WebhookDispatcherService) => s.sendMeetingStartedWebhook(fakeRoom), 'meetingStarted'],
		[
			'participantJoined',
			(s: WebhookDispatcherService) => s.sendParticipantJoinedWebhook(participantPayload),
			'participantJoined'
		],
		[
			'participantLeft',
			(s: WebhookDispatcherService) => s.sendParticipantLeftWebhook(participantPayload),
			'participantLeft'
		],
		[
			'participantRoleChanged',
			(s: WebhookDispatcherService) => s.sendParticipantRoleChangedWebhook(participantPayload),
			'participantRoleChanged'
		],
		[
			'participantHandChanged',
			(s: WebhookDispatcherService) => s.sendParticipantHandChangedWebhook(participantPayload),
			'participantHandChanged'
		],
		['recordingStarted', (s: WebhookDispatcherService) => s.sendRecordingStartedWebhook(recording), 'recordingStarted'],
		['recordingUpdated', (s: WebhookDispatcherService) => s.sendRecordingUpdatedWebhook(recording), 'recordingUpdated'],
		['recordingEnded', (s: WebhookDispatcherService) => s.sendRecordingEndedWebhook(recording), 'recordingEnded']
	])('sends %s as its own event, carrying its payload', (_name, send, event) => {
		const service = buildService();

		send(service);

		expect(service.calls).toEqual([{ event, payload: expect.objectContaining({ roomId: 'room-1' }) }]);
	});
});

/**
 * Delivery over real HTTP to a local receiver: what is sent, to which endpoints, how it is signed, and
 * how a failing endpoint is retried and reported.
 */
describe('WebhookDispatcherService delivery', () => {
	type Received = { path: string; headers: http.IncomingHttpHeaders; body: string };
	const API_KEY = 'secret-key';
	const original = { ...INTERNAL_CONFIG };
	let received: Received[] = [];
	let answers: Record<string, number[]> = {};
	let server: http.Server;
	let base: string;

	beforeAll(async () => {
		// Jest runs the test in its own realm, where the errors fetch throws are not instances of Error.
		const realFetch = globalThis.fetch;
		jest.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
			try {
				return await realFetch(...args);
			} catch (error) {
				const { name, message, cause } = error as Error;
				throw Object.assign(name === 'TypeError' ? new TypeError(message, { cause }) : new Error(message), {
					name
				});
			}
		});
		server = http.createServer((req, res) => {
			let body = '';
			req.on('data', (chunk) => (body += chunk));
			req.on('end', () => {
				const path = req.url ?? '';
				received.push({ path, headers: req.headers, body });

				if (path === '/hang') return;

				res.statusCode = answers[path]?.shift() ?? 200;
				res.statusMessage = res.statusCode === 200 ? 'OK' : 'Nope';
				res.end();
			});
		});
		await new Promise<void>((resolve) => server.listen(0, resolve));
		base = `http://localhost:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		jest.restoreAllMocks();
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	afterEach(() => {
		received = [];
		answers = {};
		setInternalConfig(original);
	});

	const webhook = (path: string, overrides: Partial<MeetWebhook> = {}) =>
		({ webhookId: `wh-${path}`, url: `${base}${path}`, enabled: true, ...overrides }) as MeetWebhook;

	const build = (webhooks: MeetWebhook[], apiKeys = [{ key: API_KEY }]) => {
		const warnings: string[] = [];
		const reasons: unknown[] = [];
		const service = new WebhookDispatcherService(
			...([
				{
					info: () => {},
					verbose: () => {},
					warn: (message: string, reason?: unknown) => {
						warnings.push(message);
						reasons.push(reason);
					}
				},
				{ findEnabled: async () => webhooks },
				{ getApiKeys: async () => apiKeys }
			] as unknown as ConstructorParameters<typeof WebhookDispatcherService>)
		);
		const send = (event: MeetWebhookEventType, payload: object) =>
			(
				service as unknown as { sendWebhookEvent: (e: MeetWebhookEventType, p: object) => Promise<void> }
			).sendWebhookEvent(event, payload);
		return { service, send, warnings, reasons };
	};

	it('posts the event to every endpoint it matches, signed over the exact bytes sent', async () => {
		const { send } = build([
			webhook('/all'),
			webhook('/same-room', { roomId: 'room-1' }),
			webhook('/other-room', { roomId: 'room-2' }),
			webhook('/other-events', { events: [MeetWebhookEventType.RECORDING_STARTED] }),
			webhook('/this-event', { events: [MeetWebhookEventType.MEETING_STARTED] }),
			webhook('/disabled', { enabled: false })
		]);

		await send(MeetWebhookEventType.MEETING_STARTED, fakeRoom);

		expect(received.map(({ path }) => path).sort()).toEqual(['/all', '/same-room', '/this-event']);

		for (const { headers, body } of received) {
			const timestamp = headers['x-timestamp'] as string;
			expect(headers['content-type']).toBe('application/json');
			expect(JSON.parse(body)).toEqual({
				event: MeetWebhookEventType.MEETING_STARTED,
				creationDate: Number(timestamp),
				data: fakeRoom
			});
			expect(headers['x-signature']).toBe(
				crypto.createHmac('sha256', API_KEY).update(`${timestamp}.${body}`).digest('hex')
			);
		}
	});

	it('sends nothing when no endpoint matches, without needing an API key', async () => {
		const { send } = build([webhook('/disabled', { enabled: false })], []);

		await expect(send(MeetWebhookEventType.MEETING_STARTED, fakeRoom)).resolves.toBeUndefined();
		expect(received).toEqual([]);
	});

	it('refuses to send unsigned events when no API key exists', async () => {
		const { send } = build([webhook('/all')], []);

		await expect(send(MeetWebhookEventType.MEETING_STARTED, fakeRoom)).rejects.toMatchObject({
			statusCode: expect.any(Number),
			message: 'There are no API keys configured yet. Please, create one to use webhooks.'
		});
		expect(received).toEqual([]);
	});

	it('retries a failing endpoint with a growing delay until it accepts, without holding back the others', async () => {
		setInternalConfig({ WEBHOOK_RETRY_ATTEMPTS: 3, WEBHOOK_RETRY_INITIAL_DELAY: 40 });
		answers['/flaky'] = [500, 503];
		const { send, warnings } = build([webhook('/flaky'), webhook('/healthy')]);

		const started = Date.now();
		await send(MeetWebhookEventType.MEETING_STARTED, fakeRoom);

		expect(received.map(({ path }) => path)).toEqual(['/flaky', '/healthy', '/flaky', '/flaky']);
		expect(Date.now() - started).toBeGreaterThanOrEqual(40 + 80);
		expect(new Set(received.map(({ body }) => body)).size).toBe(1);
		expect(warnings.filter((warning) => warning.startsWith('Webhook event'))).toEqual([]);
	});

	it('gives up on an endpoint after its retries and reports which one failed', async () => {
		setInternalConfig({ WEBHOOK_RETRY_ATTEMPTS: 2, WEBHOOK_RETRY_INITIAL_DELAY: 1 });
		answers['/down'] = [500, 500, 500, 500];
		const { send, warnings } = build([webhook('/down'), webhook('/healthy')]);

		await send(MeetWebhookEventType.MEETING_STARTED, fakeRoom);

		expect(received.filter(({ path }) => path === '/down')).toHaveLength(3);
		expect(received.filter(({ path }) => path === '/healthy')).toHaveLength(1);
		expect(warnings).toContain(`Webhook event meetingStarted could not be delivered to 'wh-/down' (${base}/down)`);
	});

	it('abandons a request the endpoint never answers', async () => {
		setInternalConfig({ WEBHOOK_RETRY_ATTEMPTS: 0, WEBHOOK_REQUEST_TIMEOUT: 50 });
		const { send, warnings, reasons } = build([webhook('/hang')]);

		await send(MeetWebhookEventType.MEETING_STARTED, fakeRoom);

		expect(warnings).toEqual([expect.stringContaining(`could not be delivered to 'wh-/hang'`)]);
		expect(reasons).toEqual([
			expect.objectContaining({ message: 'Request failed: Request timed out after 0.05 seconds' })
		]);
	});

	it('reports the status an endpoint refused the event with', async () => {
		setInternalConfig({ WEBHOOK_RETRY_ATTEMPTS: 0 });
		answers['/refuses'] = [403];
		const { send, reasons } = build([webhook('/refuses')]);

		await send(MeetWebhookEventType.MEETING_STARTED, fakeRoom);

		expect(reasons).toEqual([
			expect.objectContaining({ message: 'Request failed: Request failed with status 403' })
		]);
	});

	describe('testWebhookUrl', () => {
		it('sends a signed test event to the URL', async () => {
			const { service } = build([]);

			await service.testWebhookUrl(`${base}/test`);

			const [{ headers, body }] = received;
			expect(JSON.parse(body)).toEqual({
				event: 'testEvent',
				creationDate: Number(headers['x-timestamp']),
				data: { message: 'This is a test webhook event' }
			});
			expect(headers['x-signature']).toBe(
				crypto.createHmac('sha256', API_KEY).update(`${headers['x-timestamp']}.${body}`).digest('hex')
			);
		});

		it.each([
			[503, `Server error (503 Nope)`],
			[500, `Server error (500 Nope)`],
			[404, `Client error (404 Nope)`],
			[400, `Client error (400 Nope)`],
			[302, `Unexpected response (302)`]
		])('answers 400 for a URL that answers %i', async (status, reason) => {
			answers['/test'] = [status];
			const { service } = build([]);

			await expect(service.testWebhookUrl(`${base}/test`)).rejects.toMatchObject({
				statusCode: 400,
				message: `Webhook URL '${base}/test' is invalid: ${reason}`
			});
		});

		it('answers 400 for a URL that never answers', async () => {
			setInternalConfig({ WEBHOOK_REQUEST_TIMEOUT: 50 });
			const { service } = build([]);

			await expect(service.testWebhookUrl(`${base}/hang`)).rejects.toMatchObject({
				statusCode: 400,
				message: `Webhook URL '${base}/hang' is invalid: Request timed out after 0.05 seconds`
			});
		});

		it('answers 400 for a URL nothing listens on', async () => {
			const closed = http.createServer();
			await new Promise<void>((resolve) => closed.listen(0, resolve));
			const { port } = closed.address() as AddressInfo;
			await new Promise<void>((resolve) => closed.close(() => resolve()));
			const { service } = build([]);

			await expect(service.testWebhookUrl(`http://localhost:${port}/test`)).rejects.toMatchObject({
				statusCode: 400,
				message: `Webhook URL 'http://localhost:${port}/test' is invalid: Connection refused by server`
			});
		});

		it('answers 400 for a URL whose domain does not resolve', async () => {
			const { service } = build([]);
			const url = 'http://meet-webhook-test.invalid/test';

			await expect(service.testWebhookUrl(url)).rejects.toMatchObject({
				statusCode: 400,
				message: `Webhook URL '${url}' is invalid: Domain name could not be resolved`
			});
		});

		it('answers with the missing API key before trying the URL', async () => {
			const { service } = build([], []);

			await expect(service.testWebhookUrl(`${base}/test`)).rejects.toMatchObject({ name: 'Webhook Error' });
			expect(received).toEqual([]);
		});
	});
});
