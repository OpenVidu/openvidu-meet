import { beforeEach, describe, expect, it } from '@jest/globals';
import { EgressStatus, EncodingOptionsPreset, StreamInfo_Status } from '@livekit/protocol';
import type { MeetBroadcastInfo } from '@openvidu-meet/typings';
import {
	MeetBroadcastStatus,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout,
	MeetWebhookEventType
} from '@openvidu-meet/typings';
import type { EgressInfo, RoomCompositeOptions, StreamOutput } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import type { BroadcastRecord } from '../../../src/models/broadcast.model.js';
import { OpenViduMeetError } from '../../../src/models/error.model.js';
import { BroadcastService } from '../../../src/services/broadcast.service.js';

const ROOM_ID = 'room-1';
const REAL_URLS = { a: 'rtmp://mtx/live/aaaKEYaaa', b: 'rtmp://mtx/live/bbbKEYbbb' };
const REDACTED = 'rtmp://mtx/live/********';
const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

type StreamResult = {
	status?: StreamInfo_Status;
	startedAt?: bigint;
	endedAt?: bigint;
	duration?: bigint;
	error?: string;
};

const streams = (results: StreamResult[]) =>
	results.map((result) => ({
		url: REDACTED,
		status: StreamInfo_Status.ACTIVE,
		startedAt: 0n,
		endedAt: 0n,
		duration: 0n,
		error: '',
		...result
	})) as unknown as EgressInfo['streamResults'];

const egressWith = (overrides: Partial<EgressInfo>): EgressInfo =>
	({
		egressId: 'EG_1',
		roomName: ROOM_ID,
		status: EgressStatus.EGRESS_ACTIVE,
		startedAt: 0n,
		endedAt: 0n,
		errorCode: 0,
		error: '',
		details: '',
		streamResults: streams([{}]),
		fileResults: [],
		...overrides
	}) as unknown as EgressInfo;

const liveRecord = (overrides: Partial<BroadcastRecord> = {}): BroadcastRecord => ({
	broadcastId: 'bc-a',
	roomId: ROOM_ID,
	roomName: 'Room',
	status: MeetBroadcastStatus.ACTIVE,
	name: 'A',
	url: REAL_URLS.a,
	destinationId: 'a',
	layout: MeetRecordingLayout.GRID,
	encoding: MeetRecordingEncodingPreset.H264_720P_30,
	startDate: 1000,
	egressId: 'EG_1',
	streamIndex: 0,
	...overrides
});

class FakeLiveKitService {
	participants = true;
	egressList: EgressInfo[] = [];
	startCalls: { roomName: string; urls: string[]; layout?: string; encodingOptions?: unknown }[] = [];
	stopCalls: string[] = [];
	stopFails = false;
	alreadyEnded = false;
	reachable = true;
	probeCalls: string[] = [];
	updateCalls: { egressId: string; add: string[]; remove: string[] }[] = [];
	updateResponses: EgressInfo[] = [];
	refusedUrl: string | undefined;
	nextEgress: EgressInfo = egressWith({});

	async roomHasParticipants(): Promise<boolean> {
		return this.participants;
	}

	async startRoomComposite(
		roomName: string,
		output: StreamOutput,
		options: RoomCompositeOptions
	): Promise<EgressInfo> {
		this.startCalls.push({
			roomName,
			urls: output.urls,
			layout: options.layout,
			encodingOptions: options.encodingOptions
		});
		return this.nextEgress;
	}

	async stopEgressIfRunning(egressId: string): Promise<EgressInfo | undefined> {
		this.stopCalls.push(egressId);

		if (this.stopFails) throw new Error('egress unreachable');

		return this.alreadyEnded ? undefined : this.nextEgress;
	}

	async updateStream(egressId: string, add: string[], remove: string[]): Promise<EgressInfo | undefined> {
		this.updateCalls.push({ egressId, add, remove });

		if (add.includes(this.refusedUrl!)) throw new Error('sink failed');

		return this.alreadyEnded ? undefined : (this.updateResponses.shift() ?? this.nextEgress);
	}

	async getEgress(): Promise<EgressInfo[]> {
		return this.egressList;
	}

	async isEgressReachable(egressId: string): Promise<boolean> {
		this.probeCalls.push(egressId);
		return this.reachable;
	}
}

class FakeMutexService {
	busyAttempts = 0;
	attempts: number[] = [];

	async withRetryLock<T>(
		_key: string,
		_ttl: number,
		callback: () => Promise<T>,
		maxAttempts: number
	): Promise<T | null> {
		this.attempts.push(maxAttempts);
		return this.busyAttempts >= maxAttempts ? null : callback();
	}
}

class FakeBroadcastStateService {
	records = new Map<string, BroadcastRecord[]>();

	async save(roomId: string, records: BroadcastRecord[]): Promise<void> {
		if (records.length === 0) {
			this.records.delete(roomId);
		} else {
			this.records.set(roomId, structuredClone(records));
		}
	}

	async find(roomId: string): Promise<BroadcastRecord[]> {
		return this.records.get(roomId) ?? [];
	}
}

class FakeRoomService {
	layout = MeetRecordingLayout.SPEAKER;
	encoding = MeetRecordingEncodingPreset.H264_1080P_30;

	async getMeetRoom() {
		return {
			roomName: 'Room',
			config: {
				broadcast: {
					enabled: true,
					layout: this.layout,
					encoding: this.encoding,
					destinations: [
						{ id: 'a', name: 'A', url: REDACTED },
						{ id: 'b', name: 'B', url: REDACTED }
					]
				}
			}
		};
	}
}

class FakeRoomRepository {
	async findBroadcastDestinationUrls(): Promise<Record<string, string>> {
		return REAL_URLS;
	}
}

class FakeFrontendEventService {
	signals: MeetBroadcastInfo[] = [];

	async sendBroadcastUpdatedSignal(_roomId: string, info: MeetBroadcastInfo): Promise<void> {
		this.signals.push(info);
	}
}

class FakeWebhookDispatcherService {
	events: { type: MeetWebhookEventType; name: string; status: string }[] = [];

	sendBroadcastStartedWebhook(info: MeetBroadcastInfo) {
		this.events.push({ type: MeetWebhookEventType.BROADCAST_STARTED, name: info.name, status: info.status });
	}

	sendBroadcastUpdatedWebhook(info: MeetBroadcastInfo) {
		this.events.push({ type: MeetWebhookEventType.BROADCAST_UPDATED, name: info.name, status: info.status });
	}

	sendBroadcastEndedWebhook(info: MeetBroadcastInfo) {
		this.events.push({ type: MeetWebhookEventType.BROADCAST_ENDED, name: info.name, status: info.status });
	}
}

const expectStatus = async (promise: Promise<unknown>, statusCode: number) => {
	await expect(promise).rejects.toBeInstanceOf(OpenViduMeetError);
	await promise.catch((error: OpenViduMeetError) => expect(error.statusCode).toBe(statusCode));
};

describe('BroadcastService', () => {
	let livekit: FakeLiveKitService;
	let mutex: FakeMutexService;
	let state: FakeBroadcastStateService;
	let roomService: FakeRoomService;
	let frontend: FakeFrontendEventService;
	let webhooks: FakeWebhookDispatcherService;
	let service: BroadcastService;

	const saved = () => state.records.get(ROOM_ID) ?? [];
	const webhookSummary = () => webhooks.events.map(({ type, name, status }) => `${type}:${name}:${status}`);

	beforeEach(() => {
		livekit = new FakeLiveKitService();
		mutex = new FakeMutexService();
		state = new FakeBroadcastStateService();
		roomService = new FakeRoomService();
		frontend = new FakeFrontendEventService();
		webhooks = new FakeWebhookDispatcherService();
		service = new BroadcastService(
			...([
				livekit,
				mutex,
				state,
				roomService,
				new FakeRoomRepository(),
				frontend,
				webhooks,
				noopLogger
			] as unknown as ConstructorParameters<typeof BroadcastService>)
		);
	});

	describe('startBroadcasts', () => {
		it('starts a stream egress to the room destination, keeps its real URL server-side and tells everyone', async () => {
			livekit.nextEgress = egressWith({ status: EgressStatus.EGRESS_STARTING });

			const [info] = await service.startBroadcasts(ROOM_ID, { destinations: [{ destinationId: 'a' }] });

			expect(livekit.startCalls).toEqual([
				{
					roomName: ROOM_ID,
					urls: [REAL_URLS.a],
					layout: MeetRecordingLayout.SPEAKER,
					encodingOptions: EncodingOptionsPreset.H264_1080P_30
				}
			]);
			expect(info).toMatchObject({
				broadcastId: expect.stringMatching(/^room-1--/),
				status: MeetBroadcastStatus.STARTING,
				name: 'A',
				url: REDACTED,
				destinationId: 'a',
				layout: MeetRecordingLayout.SPEAKER,
				encoding: MeetRecordingEncodingPreset.H264_1080P_30
			});
			expect(saved()).toMatchObject([
				{ broadcastId: info.broadcastId, url: REAL_URLS.a, egressId: 'EG_1', streamIndex: 0 }
			]);
			expect(frontend.signals.map(({ url }) => url)).toEqual([REDACTED]);
			expect(webhookSummary()).toEqual(['broadcastStarted:A:starting']);
		});

		it('starts the egress with the first destination and adds each next one on its own, so each knows its stream', async () => {
			livekit.nextEgress = egressWith({ streamResults: streams([{}]) });
			livekit.updateResponses = [
				egressWith({ streamResults: streams([{}, {}]) }),
				egressWith({ streamResults: streams([{ startedAt: 1_000_000_000n }, {}, {}]) })
			];

			const broadcasts = await service.startBroadcasts(ROOM_ID, {
				destinations: [
					{ destinationId: 'a' },
					{ destinationId: 'b' },
					{ name: 'Extra', url: 'rtmp://mtx/live/xxxKEYxxx' }
				]
			});

			expect(livekit.startCalls.map(({ urls }) => urls)).toEqual([[REAL_URLS.a]]);
			expect(livekit.updateCalls).toEqual([
				{ egressId: 'EG_1', add: [REAL_URLS.b], remove: [] },
				{ egressId: 'EG_1', add: ['rtmp://mtx/live/xxxKEYxxx'], remove: [] }
			]);
			expect(broadcasts.map(({ name, status }) => `${name}:${status}`)).toEqual([
				'A:active',
				'B:starting',
				'Extra:starting'
			]);
			expect(saved().map(({ name, streamIndex }) => `${name}:${streamIndex}`)).toEqual(['A:0', 'B:1', 'Extra:2']);
			expect(webhookSummary()).toEqual([
				'broadcastStarted:A:active',
				'broadcastStarted:B:starting',
				'broadcastStarted:Extra:starting'
			]);
		});

		it('streams to every room destination not streamed to yet when the request names none', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			livekit.egressList = [egressWith({})];
			livekit.nextEgress = egressWith({ streamResults: streams([{ startedAt: 1_000_000_000n }, {}]) });

			const broadcasts = await service.startBroadcasts(ROOM_ID, {});

			expect(livekit.startCalls).toEqual([]);
			expect(livekit.updateCalls).toEqual([{ egressId: 'EG_1', add: [REAL_URLS.b], remove: [] }]);
			expect(broadcasts).toMatchObject([{ name: 'B', destinationId: 'b', layout: MeetRecordingLayout.GRID }]);
			expect(saved().map(({ name, streamIndex }) => `${name}:${streamIndex}`)).toEqual(['A:0', 'B:1']);
			expect(webhookSummary()).toEqual(['broadcastStarted:B:starting']);

			await expectStatus(service.startBroadcasts(ROOM_ID, {}), 409);
		});

		it('withdraws the streams it added when a later destination fails, so none of them starts', async () => {
			livekit.refusedUrl = 'rtmp://mtx/live/xxxKEYxxx';

			await expect(
				service.startBroadcasts(ROOM_ID, {
					destinations: [{ destinationId: 'a' }, { name: 'Extra', url: 'rtmp://mtx/live/xxxKEYxxx' }]
				})
			).rejects.toThrow('sink failed');

			expect(livekit.updateCalls.at(-1)).toEqual({ egressId: 'EG_1', add: [], remove: [REAL_URLS.a] });
			expect(saved()).toEqual([]);
			expect(webhooks.events).toEqual([]);
		});

		it('refuses a room without participants, a destination already streamed to or asked twice, and a sixth destination', async () => {
			livekit.participants = false;
			await expectStatus(service.startBroadcasts(ROOM_ID, { destinations: [{ destinationId: 'a' }] }), 409);

			livekit.participants = true;
			await state.save(ROOM_ID, [liveRecord()]);
			livekit.egressList = [egressWith({})];
			await expectStatus(service.startBroadcasts(ROOM_ID, { destinations: [{ destinationId: 'a' }] }), 409);
			await expectStatus(
				service.startBroadcasts(ROOM_ID, {
					destinations: [{ destinationId: 'b' }, { name: 'B again', url: REAL_URLS.b }]
				}),
				422
			);

			await state.save(
				ROOM_ID,
				['1', '2', '3', '4'].map((key) =>
					liveRecord({
						broadcastId: `bc-${key}`,
						url: `rtmp://mtx/live/${key}`,
						destinationId: undefined,
						streamIndex: Number(key) - 1
					})
				)
			);
			await expectStatus(
				service.startBroadcasts(ROOM_ID, { destinations: [{ destinationId: 'a' }, { destinationId: 'b' }] }),
				422
			);
			expect(livekit.startCalls).toEqual([]);
			expect(livekit.updateCalls).toEqual([]);
		});

		it('settles the broadcasts of an egress LiveKit no longer runs, then starts a new one', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			livekit.egressList = [
				egressWith({
					status: EgressStatus.EGRESS_COMPLETE,
					endedAt: 61_000_000_000n,
					streamResults: streams([
						{
							status: StreamInfo_Status.FINISHED,
							startedAt: 1_000_000_000n,
							endedAt: 61_000_000_000n,
							duration: 60_000_000_000n
						}
					])
				})
			];
			livekit.nextEgress = egressWith({ egressId: 'EG_2', status: EgressStatus.EGRESS_STARTING });

			const [info] = await service.startBroadcasts(ROOM_ID, { destinations: [{ destinationId: 'a' }] });

			expect(livekit.startCalls).toHaveLength(1);
			expect(info.status).toBe(MeetBroadcastStatus.STARTING);
			expect(saved()).toMatchObject([{ broadcastId: info.broadcastId, egressId: 'EG_2' }]);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete', 'broadcastStarted:A:starting']);
		});

		it('starts a new egress when the one it meant to join ended just before', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			livekit.egressList = [egressWith({})];
			livekit.alreadyEnded = true;

			await service.startBroadcasts(ROOM_ID, { destinations: [{ destinationId: 'b' }] });

			expect(livekit.updateCalls).toHaveLength(1);
			expect(livekit.startCalls).toHaveLength(1);
		});

		it('waits for another change of the broadcasts to finish instead of answering 409', async () => {
			mutex.busyAttempts = 3;

			await service.startBroadcasts(ROOM_ID, {});

			expect(livekit.startCalls).toHaveLength(1);
		});

		it('answers 409 when another change holds the room lock for longer than a request waits', async () => {
			mutex.busyAttempts = Infinity;
			await expectStatus(service.startBroadcasts(ROOM_ID, {}), 409);
			expect(livekit.startCalls).toEqual([]);
		});
	});

	describe('stopBroadcasts', () => {
		const twoLive = () => [
			liveRecord(),
			liveRecord({ broadcastId: 'bc-b', name: 'B', url: REAL_URLS.b, destinationId: 'b', streamIndex: 1 })
		];
		const finished = {
			status: StreamInfo_Status.FINISHED,
			startedAt: 1_000_000_000n,
			endedAt: 61_000_000_000n,
			duration: 60_000_000_000n
		};

		it('removes the real URL from the egress and ends the broadcast with what LiveKit reports, the others going on', async () => {
			await state.save(ROOM_ID, twoLive());
			livekit.nextEgress = egressWith({ streamResults: streams([finished, { startedAt: 1_000_000_000n }]) });

			const [info] = await service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-a'] });

			expect(livekit.updateCalls).toEqual([{ egressId: 'EG_1', add: [], remove: [REAL_URLS.a] }]);
			expect(info).toMatchObject({ status: 'complete', endDate: 61_000, duration: 60, url: REDACTED });
			expect(saved().map(({ broadcastId }) => broadcastId)).toEqual(['bc-b']);
			expect(frontend.signals.map(({ broadcastId, status }) => `${broadcastId}:${status}`)).toEqual([
				'bc-a:complete'
			]);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete']);
		});

		it('stops every running broadcast when the request names none', async () => {
			await state.save(ROOM_ID, [
				...twoLive(),
				liveRecord({
					broadcastId: 'bc-c',
					url: 'rtmp://mtx/live/c',
					status: MeetBroadcastStatus.ENDING,
					streamIndex: 2
				})
			]);
			livekit.updateResponses = [
				egressWith({
					streamResults: streams([finished, { startedAt: 1_000_000_000n }, { startedAt: 1_000_000_000n }])
				}),
				egressWith({
					status: EgressStatus.EGRESS_ENDING,
					streamResults: streams([finished, finished, { startedAt: 1_000_000_000n }])
				})
			];

			const broadcasts = await service.stopBroadcasts(ROOM_ID, {});

			expect(livekit.updateCalls.map(({ remove }) => remove)).toEqual([[REAL_URLS.a], [REAL_URLS.b]]);
			expect(broadcasts.map(({ broadcastId, status }) => `${broadcastId}:${status}`)).toEqual([
				'bc-a:complete',
				'bc-b:complete'
			]);
			expect(saved().map(({ broadcastId, status }) => `${broadcastId}:${status}`)).toEqual(['bc-c:ending']);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete', 'broadcastEnded:B:complete']);
		});

		it('answers with nothing when no broadcast runs', async () => {
			expect(await service.stopBroadcasts(ROOM_ID, {})).toEqual([]);
			expect(livekit.updateCalls).toEqual([]);
		});

		it('ends the broadcast even when LiveKit answers without its final stream state', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			livekit.nextEgress = egressWith({ status: EgressStatus.EGRESS_ENDING, streamResults: streams([]) });

			const [info] = await service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-a'] });

			expect(info.status).toBe(MeetBroadcastStatus.COMPLETE);
			expect(saved()).toEqual([]);
		});

		it('answers 404 for an unknown broadcast and 409 for one already ending, stopping none of the others', async () => {
			await state.save(ROOM_ID, twoLive());
			await expectStatus(service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-a', 'bc-zzz'] }), 404);

			await state.save(ROOM_ID, [...twoLive().slice(1), liveRecord({ status: MeetBroadcastStatus.ENDING })]);
			await expectStatus(service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-b', 'bc-a'] }), 409);
			expect(livekit.updateCalls).toEqual([]);
		});

		it('settles with LiveKit last report a broadcast whose egress ended just before the stop', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			livekit.alreadyEnded = true;
			livekit.egressList = [
				egressWith({
					status: EgressStatus.EGRESS_FAILED,
					endedAt: 30_000_000_000n,
					error: 'boom',
					streamResults: streams([{ startedAt: 1_000_000_000n }])
				})
			];

			const [info] = await service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-a'] });

			expect(info).toMatchObject({ status: 'failed', error: 'boom', endDate: 30_000 });
			expect(saved()).toEqual([]);
		});
	});

	describe('handleEgressEvent', () => {
		it('ignores an egress that streams no broadcast of the room', async () => {
			await state.save(ROOM_ID, [liveRecord()]);

			await service.handleEgressEvent(egressWith({ egressId: 'EG_other' }));

			expect(frontend.signals).toEqual([]);
			expect(webhooks.events).toEqual([]);
		});

		it('moves each broadcast along with its own stream, telling only about the ones that changed', async () => {
			await state.save(ROOM_ID, [
				liveRecord({ status: MeetBroadcastStatus.STARTING, startDate: undefined }),
				liveRecord({ broadcastId: 'bc-b', name: 'B', url: REAL_URLS.b, destinationId: 'b', streamIndex: 1 })
			]);

			await service.handleEgressEvent(
				egressWith({ streamResults: streams([{ startedAt: 2_000_000_000n }, { startedAt: 1_000_000_000n }]) })
			);

			expect(
				saved().map(({ broadcastId, status, startDate }) => `${broadcastId}:${status}:${startDate}`)
			).toEqual(['bc-a:active:2000', 'bc-b:active:1000']);
			expect(webhookSummary()).toEqual(['broadcastUpdated:A:active']);
			expect(frontend.signals).toHaveLength(1);
		});

		it('settles and forgets the broadcasts on egress_ended', async () => {
			await state.save(ROOM_ID, [
				liveRecord(),
				liveRecord({
					broadcastId: 'bc-b',
					name: 'B',
					url: REAL_URLS.b,
					destinationId: 'b',
					streamIndex: 1,
					status: MeetBroadcastStatus.STARTING,
					startDate: undefined
				})
			]);

			await service.handleEgressEvent(
				egressWith({
					status: EgressStatus.EGRESS_COMPLETE,
					endedAt: 61_000_000_000n,
					streamResults: streams([
						{
							status: StreamInfo_Status.FINISHED,
							startedAt: 1_000_000_000n,
							endedAt: 61_000_000_000n,
							duration: 60_000_000_000n
						},
						{}
					])
				})
			);

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete', 'broadcastEnded:B:aborted']);
			expect(frontend.signals.map(({ url }) => url)).toEqual([REDACTED, REDACTED]);
		});

		it('drops an update that changes nothing, as LiveKit sends after a request made the change', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			const snapshot = egressWith({ streamResults: streams([{ startedAt: 1_000_000_000n }]) });

			await service.handleEgressEvent(snapshot);
			await service.handleEgressEvent(snapshot);

			expect(webhooks.events).toEqual([]);
			expect(frontend.signals).toEqual([]);
		});

		it('outwaits a change that a request would give up on, so the latest state is not dropped', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			mutex.busyAttempts = Infinity;
			await expectStatus(service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-a'] }), 409);
			mutex.busyAttempts = mutex.attempts[0];

			await service.handleEgressEvent(
				egressWith({
					status: EgressStatus.EGRESS_ENDING,
					streamResults: streams([{ startedAt: 1_000_000_000n }])
				})
			);

			expect(saved()[0].status).toBe(MeetBroadcastStatus.ENDING);
		});

		it('gives up quietly when the room lock never frees', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			mutex.busyAttempts = Infinity;

			await expect(service.handleEgressEvent(egressWith({}))).resolves.toBeUndefined();
			expect(frontend.signals).toEqual([]);
		});
	});

	describe('handleEgressParticipantLeft', () => {
		it('ends the broadcasts as failed when their egress leaves the room and no longer answers', async () => {
			await state.save(ROOM_ID, [
				liveRecord(),
				liveRecord({ broadcastId: 'bc-b', name: 'B', url: REAL_URLS.b, streamIndex: 1 })
			]);
			livekit.reachable = false;

			await service.handleEgressParticipantLeft(ROOM_ID, 'EG_1');

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:failed', 'broadcastEnded:B:failed']);
			expect(frontend.signals[0]).toMatchObject({
				status: 'failed',
				error: expect.any(String),
				endDate: expect.any(Number)
			});
		});

		it('leaves the broadcasts alone while their egress still answers', async () => {
			await state.save(ROOM_ID, [liveRecord()]);

			await service.handleEgressParticipantLeft(ROOM_ID, 'EG_1');

			expect(livekit.probeCalls).toEqual(['EG_1']);
			expect(saved()[0].status).toBe(MeetBroadcastStatus.ACTIVE);
			expect(webhooks.events).toEqual([]);
		});

		it('does not even probe an egress that streams no broadcast, like a recording', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			livekit.reachable = false;

			await service.handleEgressParticipantLeft(ROOM_ID, 'EG_RECORDING');

			expect(livekit.probeCalls).toEqual([]);
			expect(saved()[0].status).toBe(MeetBroadcastStatus.ACTIVE);
		});
	});

	describe('cleanupRoom', () => {
		it('ends the broadcasts of a meeting that finished before LiveKit reported the end', async () => {
			await state.save(ROOM_ID, [
				liveRecord(),
				liveRecord({ broadcastId: 'bc-b', name: 'B', url: REAL_URLS.b, streamIndex: 1 })
			]);
			livekit.nextEgress = egressWith({
				status: EgressStatus.EGRESS_ENDING,
				streamResults: streams([{ startedAt: 1_000_000_000n }, { startedAt: 1_000_000_000n }])
			});

			await service.cleanupRoom(ROOM_ID);

			expect(livekit.stopCalls).toEqual(['EG_1']);
			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete', 'broadcastEnded:B:complete']);
		});

		it('stops an egress still starting, which would outlive the room, and reports its broadcast aborted', async () => {
			await state.save(ROOM_ID, [liveRecord({ status: MeetBroadcastStatus.STARTING, startDate: undefined })]);
			livekit.nextEgress = egressWith({ status: EgressStatus.EGRESS_ABORTED });

			await service.cleanupRoom(ROOM_ID);

			expect(livekit.stopCalls).toEqual(['EG_1']);
			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:aborted']);
		});

		it('settles with what LiveKit last reported, so a destination that just connected still counts', async () => {
			await state.save(ROOM_ID, [liveRecord({ status: MeetBroadcastStatus.STARTING, startDate: undefined })]);
			livekit.nextEgress = egressWith({
				status: EgressStatus.EGRESS_ENDING,
				streamResults: streams([{ startedAt: 5_000_000_000n }])
			});

			await service.cleanupRoom(ROOM_ID);

			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete']);
			expect(frontend.signals[0].startDate).toBe(5000);
		});

		it('takes an egress LiveKit already ended as ended, and settles with what LiveKit reports of it', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			livekit.alreadyEnded = true;
			livekit.egressList = [egressWith({ status: EgressStatus.EGRESS_COMPLETE })];

			await service.cleanupRoom(ROOM_ID);

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete']);
		});

		it('still settles the broadcasts when the egress cannot be stopped', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			livekit.stopFails = true;

			await service.cleanupRoom(ROOM_ID);

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete']);
		});

		it('does nothing for a room without broadcasts', async () => {
			await service.cleanupRoom(ROOM_ID);

			expect(webhooks.events).toEqual([]);
		});
	});

	describe('getBroadcasts', () => {
		it('serves the broadcasts in progress, redacted, and tells whether the meeting is broadcast', async () => {
			await state.save(ROOM_ID, [liveRecord()]);
			const [broadcast] = await service.getBroadcasts(ROOM_ID);

			expect(broadcast.url).toBe(REDACTED);
			expect(broadcast).not.toHaveProperty('egressId');
			expect(broadcast).not.toHaveProperty('streamIndex');
			expect(await service.isBroadcastActive(ROOM_ID)).toBe(true);
			expect((await service.getBroadcast(ROOM_ID, 'bc-a')).broadcastId).toBe('bc-a');
			await expectStatus(service.getBroadcast(ROOM_ID, 'bc-zzz'), 404);

			await state.save(ROOM_ID, []);
			expect(await service.getBroadcasts(ROOM_ID)).toEqual([]);
			expect(await service.isBroadcastActive(ROOM_ID)).toBe(false);
		});
	});
});
