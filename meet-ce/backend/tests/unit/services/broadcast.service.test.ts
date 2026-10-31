import { beforeEach, describe, expect, it, jest } from '@jest/globals';
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
import { BroadcastHelper } from '../../../src/helpers/broadcast.helper.js';
import type { BroadcastRecord } from '../../../src/models/broadcast.model.js';
import { errorEgressNotAvailable, OpenViduMeetError } from '../../../src/models/error.model.js';
import { RedisKeyName } from '../../../src/models/redis.model.js';
import { BroadcastStateService } from '../../../src/services/broadcast-state.service.js';
import { BroadcastService } from '../../../src/services/broadcast.service.js';
import type { RedisService } from '../../../src/services/redis.service.js';

const ROOM_ID = 'room-1';
const REAL_URLS = { a: 'rtmp://mtx/live/aaaKEYaaa', b: 'rtmp://mtx/live/bbbKEYbbb' };
const REDACTED = 'rtmp://mtx/live/********';
const TAG = '#ov-stream-tag=';
const tagged = (url: string, broadcastId: string) => `${url}${TAG}${broadcastId}`;
const assertDestinationsAllowed = BroadcastHelper.assertDestinationsAllowed.bind(BroadcastHelper);
const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

type StreamResult = {
	/** The broadcast whose tag the stream carries; without it, the fake LiveKit tags it by position */
	tag?: string;
	status?: StreamInfo_Status;
	startedAt?: bigint;
	endedAt?: bigint;
	duration?: bigint;
	error?: string;
};

const streams = (results: StreamResult[]) =>
	results.map(({ tag, ...result }) => ({
		url: tag ? tagged(REDACTED, tag) : REDACTED,
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
	destination: { id: 'a', name: 'A', url: REAL_URLS.a },
	layout: MeetRecordingLayout.GRID,
	encoding: MeetRecordingEncodingPreset.H264_720P_30,
	startDate: 1000,
	egressId: 'EG_1',
	...overrides
});

/**
 * LiveKit as the broadcast service sees it. Like the egress, it reports each stream with the tag
 * of the URL that added it, in the order the URLs were added: a stream a test gives without a tag
 * gets the tag of its position.
 */
class FakeLiveKitService {
	participants = true;
	roomLive = true;
	egressInRoom = true;
	streamTags = new Map<string, string[]>();
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
	unavailableUrl: string | undefined;
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
		this.streamTags.set(this.nextEgress.egressId, output.urls.map(tagOf));
		return this.report(this.nextEgress);
	}

	async stopEgressIfRunning(egressId: string): Promise<EgressInfo | undefined> {
		this.stopCalls.push(egressId);

		if (this.stopFails) throw new Error('egress unreachable');

		return this.alreadyEnded ? undefined : this.report(this.nextEgress);
	}

	async updateStream(egressId: string, add: string[], remove: string[]): Promise<EgressInfo | undefined> {
		this.updateCalls.push({ egressId, add, remove });

		if (add.some((url) => url.startsWith(`${this.refusedUrl}${TAG}`))) throw new Error('sink failed');

		if (remove.some((url) => url.startsWith(`${this.unavailableUrl}${TAG}`))) throw errorEgressNotAvailable();

		if (this.alreadyEnded) return undefined;

		this.streamTags.set(egressId, [...(this.streamTags.get(egressId) ?? []), ...add.map(tagOf)]);
		return this.report(this.updateResponses.shift() ?? this.nextEgress);
	}

	async getEgress(): Promise<EgressInfo[]> {
		return this.egressList.map((egress) => this.report(egress));
	}

	async isEgressReachable(egressId: string): Promise<boolean> {
		this.probeCalls.push(egressId);
		return this.reachable;
	}

	async participantExists(): Promise<boolean> {
		return this.egressInRoom;
	}

	async roomExists(): Promise<boolean> {
		return this.roomLive;
	}

	/** The egress with each untagged stream tagged as the URL added at its position was. */
	report(egress: EgressInfo): EgressInfo {
		const tags = this.streamTags.get(egress.egressId) ?? [];
		const streamResults = egress.streamResults.map((stream, index) =>
			stream.url === REDACTED && tags[index] ? { ...stream, url: tagged(REDACTED, tags[index]) } : stream
		);
		return { ...egress, streamResults } as EgressInfo;
	}
}

const tagOf = (url: string) => url.slice(url.indexOf(TAG) + TAG.length);

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
	saves = 0;

	async save(roomId: string, records: BroadcastRecord[]): Promise<void> {
		this.saves++;

		if (records.length === 0) {
			this.records.delete(roomId);
		} else {
			this.records.set(roomId, structuredClone(records));
		}
	}

	async find(roomId: string): Promise<BroadcastRecord[]> {
		return structuredClone(this.records.get(roomId) ?? []);
	}

	async hasBroadcasts(roomId: string): Promise<boolean> {
		return this.records.has(roomId);
	}

	async findRoomIds(): Promise<string[]> {
		return [...this.records.keys()];
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
		this.events.push({
			type: MeetWebhookEventType.BROADCAST_STARTED,
			name: info.destination.name,
			status: info.status
		});
	}

	sendBroadcastUpdatedWebhook(info: MeetBroadcastInfo) {
		this.events.push({
			type: MeetWebhookEventType.BROADCAST_UPDATED,
			name: info.destination.name,
			status: info.status
		});
	}

	sendBroadcastEndedWebhook(info: MeetBroadcastInfo) {
		this.events.push({
			type: MeetWebhookEventType.BROADCAST_ENDED,
			name: info.destination.name,
			status: info.status
		});
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
	/** Broadcasts in progress, whose URLs the egress EG_1 took in this order. */
	const seed = async (records: BroadcastRecord[]) => {
		await state.save(ROOM_ID, records);
		livekit.streamTags.set(
			'EG_1',
			records.map(({ broadcastId }) => broadcastId)
		);
		state.saves = 0;
	};

	beforeEach(() => {
		jest.spyOn(BroadcastHelper, 'assertDestinationsAllowed').mockImplementation((urls) =>
			assertDestinationsAllowed(urls, () => Promise.reject(new Error('no DNS in unit tests')))
		);
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

			const [info] = await service.startBroadcasts(ROOM_ID, { destinationIds: ['a'] });

			expect(livekit.startCalls).toEqual([
				{
					roomName: ROOM_ID,
					urls: [tagged(REAL_URLS.a, info.broadcastId)],
					layout: MeetRecordingLayout.SPEAKER,
					encodingOptions: EncodingOptionsPreset.H264_1080P_30
				}
			]);
			expect(info).toMatchObject({
				broadcastId: expect.stringMatching(/^room-1--/),
				status: MeetBroadcastStatus.STARTING,
				destination: { id: 'a', name: 'A', url: REDACTED },
				layout: MeetRecordingLayout.SPEAKER,
				encoding: MeetRecordingEncodingPreset.H264_1080P_30
			});
			expect(saved()).toEqual([
				expect.objectContaining({
					broadcastId: info.broadcastId,
					destination: expect.objectContaining({ url: REAL_URLS.a }),
					egressId: 'EG_1'
				})
			]);
			expect(frontend.signals.map(({ destination }) => destination.url)).toEqual([REDACTED]);
			expect(webhookSummary()).toEqual(['broadcastStarted:A:starting']);
		});

		it('starts the egress with the first destination and adds the next ones, each URL tagged with its broadcast', async () => {
			livekit.nextEgress = egressWith({ streamResults: streams([{}]) });
			livekit.updateResponses = [
				egressWith({ streamResults: streams([{}, {}]) }),
				egressWith({ streamResults: streams([{ startedAt: 1_000_000_000n }, {}, {}]) })
			];

			const broadcasts = await service.startBroadcasts(ROOM_ID, {
				destinationIds: ['a', 'b'],
				destinations: [{ name: 'Extra', url: 'rtmp://mtx/live/xxxKEYxxx' }]
			});

			const [a, b, extra] = broadcasts.map(({ broadcastId }) => broadcastId);
			expect(livekit.startCalls.map(({ urls }) => urls)).toEqual([[tagged(REAL_URLS.a, a)]]);
			expect(livekit.updateCalls).toEqual([
				{ egressId: 'EG_1', add: [tagged(REAL_URLS.b, b)], remove: [] },
				{ egressId: 'EG_1', add: [tagged('rtmp://mtx/live/xxxKEYxxx', extra)], remove: [] }
			]);
			expect(broadcasts.map(({ destination, status }) => `${destination.name}:${status}`)).toEqual([
				'A:starting',
				'B:starting',
				'Extra:starting'
			]);
			expect(
				saved().map(({ destination, status }) => `${destination.name}:${destination.url}:${status}`)
			).toEqual([
				`A:${REAL_URLS.a}:active`,
				`B:${REAL_URLS.b}:starting`,
				'Extra:rtmp://mtx/live/xxxKEYxxx:starting'
			]);
			expect(webhookSummary()).toEqual([
				'broadcastStarted:A:starting',
				'broadcastStarted:B:starting',
				'broadcastStarted:Extra:starting',
				'broadcastUpdated:A:active'
			]);
		});

		it('tells each broadcast as started before the failure of its destination that LiveKit reported while the request went on', async () => {
			livekit.nextEgress = egressWith({ streamResults: streams([{}]) });
			livekit.updateResponses = [
				egressWith({
					streamResults: streams([{ status: StreamInfo_Status.FAILED, error: 'Connection refused' }, {}])
				})
			];

			const broadcasts = await service.startBroadcasts(ROOM_ID, {
				destinationIds: ['a', 'b']
			});

			expect(broadcasts.map(({ destination, status }) => `${destination.name}:${status}`)).toEqual([
				'A:starting',
				'B:starting'
			]);
			expect(saved().map(({ destination, status }) => `${destination.name}:${status}`)).toEqual(['B:starting']);
			expect(webhookSummary()).toEqual([
				'broadcastStarted:A:starting',
				'broadcastStarted:B:starting',
				'broadcastEnded:A:failed'
			]);
		});

		it('streams to every room destination not streamed to yet when the request names none', async () => {
			await seed([liveRecord()]);
			livekit.egressList = [egressWith({})];
			livekit.nextEgress = egressWith({ streamResults: streams([{ startedAt: 1_000_000_000n }, {}]) });

			const broadcasts = await service.startBroadcasts(ROOM_ID, {});

			expect(livekit.startCalls).toEqual([]);
			expect(livekit.updateCalls).toEqual([
				{ egressId: 'EG_1', add: [tagged(REAL_URLS.b, broadcasts[0].broadcastId)], remove: [] }
			]);
			expect(broadcasts).toMatchObject([
				{ destination: { id: 'b', name: 'B' }, layout: MeetRecordingLayout.GRID }
			]);
			expect(saved().map(({ destination, status }) => `${destination.name}:${status}`)).toEqual([
				'A:active',
				'B:starting'
			]);
			expect(webhookSummary()).toEqual(['broadcastStarted:B:starting']);

			await expectStatus(service.startBroadcasts(ROOM_ID, {}), 409);
		});

		it('withdraws the streams it added when a later destination fails, that one too in case the egress took it', async () => {
			livekit.refusedUrl = 'rtmp://mtx/live/xxxKEYxxx';

			await expect(
				service.startBroadcasts(ROOM_ID, {
					destinationIds: ['a'],
					destinations: [{ name: 'Extra', url: 'rtmp://mtx/live/xxxKEYxxx' }]
				})
			).rejects.toThrow('sink failed');

			const [refused] = livekit.updateCalls[0].add;
			expect(refused).toMatch(/^rtmp:\/\/mtx\/live\/xxxKEYxxx#ov-stream-tag=room-1--/);
			expect(livekit.updateCalls.slice(-2)).toEqual([
				{ egressId: 'EG_1', add: [], remove: livekit.startCalls[0].urls },
				{ egressId: 'EG_1', add: [], remove: [refused] }
			]);
			expect(saved()).toEqual([]);
			expect(webhooks.events).toEqual([]);
		});

		it('refuses an egress that does not report stream tags, and takes back the stream it started', async () => {
			livekit.nextEgress = egressWith({ streamResults: streams([{ tag: 'not-this-one' }]) });

			await expectStatus(service.startBroadcasts(ROOM_ID, { destinationIds: ['a'] }), 500);

			expect(livekit.updateCalls).toEqual([{ egressId: 'EG_1', add: [], remove: livekit.startCalls[0].urls }]);
			expect(saved()).toEqual([]);
			expect(webhooks.events).toEqual([]);
		});

		it('refuses a room without participants, and a destination already streamed to or asked twice', async () => {
			livekit.participants = false;
			await expectStatus(service.startBroadcasts(ROOM_ID, { destinationIds: ['a'] }), 409);

			livekit.participants = true;
			await seed([liveRecord()]);
			livekit.egressList = [egressWith({})];
			await expectStatus(service.startBroadcasts(ROOM_ID, { destinationIds: ['a'] }), 409);
			await expectStatus(
				service.startBroadcasts(ROOM_ID, {
					destinationIds: ['b'],
					destinations: [{ name: 'B again', url: REAL_URLS.b }]
				}),
				422
			);
			expect(livekit.startCalls).toEqual([]);
			expect(livekit.updateCalls).toEqual([]);
		});

		it('refuses a destination on the media server own host or a link-local address before taking the room lock, starting nothing', async () => {
			for (const url of ['rtmp://127.0.0.1:6379/live/key', 'rtmp://169.254.169.254/live/key']) {
				await expectStatus(
					service.startBroadcasts(ROOM_ID, {
						destinationIds: ['a'],
						destinations: [{ name: 'Internal', url }]
					}),
					422
				);
			}

			expect(mutex.attempts).toEqual([]);
			expect(livekit.startCalls).toEqual([]);
			expect(livekit.updateCalls).toEqual([]);
		});

		it('settles the broadcasts of an egress LiveKit no longer runs, then starts a new one', async () => {
			await seed([liveRecord()]);
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

			const [info] = await service.startBroadcasts(ROOM_ID, { destinationIds: ['a'] });

			expect(livekit.startCalls).toHaveLength(1);
			expect(info.status).toBe(MeetBroadcastStatus.STARTING);
			expect(saved()).toMatchObject([{ broadcastId: info.broadcastId, egressId: 'EG_2' }]);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete', 'broadcastStarted:A:starting']);
		});

		it('starts a new egress when the one it meant to join ended just before', async () => {
			await seed([liveRecord()]);
			livekit.egressList = [egressWith({})];
			livekit.alreadyEnded = true;

			await service.startBroadcasts(ROOM_ID, { destinationIds: ['b'] });

			expect(livekit.updateCalls).toHaveLength(1);
			expect(livekit.startCalls).toHaveLength(1);
		});

		it('waits for another change of the broadcasts to finish instead of answering 409', async () => {
			mutex.busyAttempts = 3;
			livekit.nextEgress = egressWith({ streamResults: streams([{}, {}]) });

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
			liveRecord({ broadcastId: 'bc-b', destination: { id: 'b', name: 'B', url: REAL_URLS.b } })
		];
		const finished = {
			status: StreamInfo_Status.FINISHED,
			startedAt: 1_000_000_000n,
			endedAt: 61_000_000_000n,
			duration: 60_000_000_000n
		};

		it('removes the tagged real URL from the egress and ends the broadcast with what LiveKit reports, the others going on', async () => {
			await seed(twoLive());
			livekit.nextEgress = egressWith({ streamResults: streams([finished, { startedAt: 1_000_000_000n }]) });

			const [info] = await service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-a'] });

			expect(livekit.updateCalls).toEqual([{ egressId: 'EG_1', add: [], remove: [tagged(REAL_URLS.a, 'bc-a')] }]);
			expect(info).toMatchObject({
				status: 'complete',
				endDate: 61_000,
				duration: 60,
				destination: { url: REDACTED }
			});
			expect(saved().map(({ broadcastId }) => broadcastId)).toEqual(['bc-b']);
			expect(frontend.signals.map(({ broadcastId, status }) => `${broadcastId}:${status}`)).toEqual([
				'bc-a:complete'
			]);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete']);
		});

		it('answers 503 when no egress service takes a stop, saving as stopped the broadcasts stopped before it', async () => {
			await seed(twoLive());
			livekit.nextEgress = egressWith({ streamResults: streams([finished, { startedAt: 1_000_000_000n }]) });
			livekit.unavailableUrl = REAL_URLS.b;

			await expectStatus(service.stopBroadcasts(ROOM_ID, {}), 503);
			await expectStatus(service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-b'] }), 503);

			expect(saved().map(({ broadcastId, status }) => `${broadcastId}:${status}`)).toEqual(['bc-b:active']);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete']);
		});

		it('stops every running broadcast when the request names none', async () => {
			await seed([
				...twoLive(),
				liveRecord({
					broadcastId: 'bc-c',
					destination: { name: 'C', url: 'rtmp://mtx/live/c' },
					status: MeetBroadcastStatus.ENDING
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

			expect(livekit.updateCalls.map(({ remove }) => remove)).toEqual([
				[tagged(REAL_URLS.a, 'bc-a')],
				[tagged(REAL_URLS.b, 'bc-b')]
			]);
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
			await seed([liveRecord()]);
			livekit.nextEgress = egressWith({ status: EgressStatus.EGRESS_ENDING, streamResults: streams([]) });

			const [info] = await service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-a'] });

			expect(info.status).toBe(MeetBroadcastStatus.COMPLETE);
			expect(saved()).toEqual([]);
		});

		it('answers 404 for an unknown broadcast and 409 for one already ending, stopping none of the others', async () => {
			await seed(twoLive());
			await expectStatus(service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-a', 'bc-zzz'] }), 404);

			await state.save(ROOM_ID, [...twoLive().slice(1), liveRecord({ status: MeetBroadcastStatus.ENDING })]);
			await expectStatus(service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-b', 'bc-a'] }), 409);
			expect(livekit.updateCalls).toEqual([]);
		});

		it('settles with LiveKit last report a broadcast whose egress ended just before the stop', async () => {
			await seed([liveRecord()]);
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
		it('stops an egress LiveKit still runs that streams no broadcast, which a request lost track of', async () => {
			await seed([liveRecord()]);
			const lost = egressWith({ egressId: 'EG_lost', status: EgressStatus.EGRESS_STARTING });
			livekit.egressList = [lost];

			await service.handleEgressEvent(lost);

			expect(livekit.stopCalls).toEqual(['EG_lost']);
			expect(saved()).toEqual([liveRecord()]);
			expect(frontend.signals).toEqual([]);
			expect(webhooks.events).toEqual([]);
		});

		it('leaves alone an egress that streams no broadcast once it is ending or over', async () => {
			for (const status of [EgressStatus.EGRESS_ENDING, EgressStatus.EGRESS_COMPLETE]) {
				await service.handleEgressEvent(egressWith({ egressId: 'EG_old', status }));
			}

			expect(livekit.stopCalls).toEqual([]);
			expect(webhooks.events).toEqual([]);
		});

		it('leaves alone an egress whose late event says it runs while LiveKit already reports it ending', async () => {
			livekit.egressList = [egressWith({ egressId: 'EG_old', status: EgressStatus.EGRESS_ENDING })];

			await service.handleEgressEvent(egressWith({ egressId: 'EG_old', status: EgressStatus.EGRESS_ACTIVE }));

			expect(livekit.stopCalls).toEqual([]);
		});

		it('moves each broadcast along with the stream of its tag, whatever the order, telling only about the ones that changed', async () => {
			await seed([
				liveRecord({ status: MeetBroadcastStatus.STARTING, startDate: undefined }),
				liveRecord({ broadcastId: 'bc-b', destination: { id: 'b', name: 'B', url: REAL_URLS.b } })
			]);

			await service.handleEgressEvent(
				egressWith({
					streamResults: streams([
						{ tag: 'bc-b', startedAt: 1_000_000_000n },
						{ tag: 'bc-a', startedAt: 2_000_000_000n }
					])
				})
			);

			expect(
				saved().map(({ broadcastId, status, startDate }) => `${broadcastId}:${status}:${startDate}`)
			).toEqual(['bc-a:active:2000', 'bc-b:active:1000']);
			expect(webhookSummary()).toEqual(['broadcastUpdated:A:active']);
			expect(frontend.signals).toHaveLength(1);
		});

		it('settles and forgets the broadcasts on egress_ended', async () => {
			await seed([
				liveRecord(),
				liveRecord({
					broadcastId: 'bc-b',
					destination: { id: 'b', name: 'B', url: REAL_URLS.b },
					status: MeetBroadcastStatus.STARTING,
					startDate: undefined
				})
			]);

			await service.handleEgressEvent(
				livekit.report(
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
				)
			);

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete', 'broadcastEnded:B:aborted']);
			expect(frontend.signals.map(({ destination }) => destination.url)).toEqual([REDACTED, REDACTED]);
		});

		it('drops an update that changes nothing, as LiveKit sends after a request made the change, without writing it', async () => {
			await seed([liveRecord()]);
			const snapshot = egressWith({ streamResults: streams([{ tag: 'bc-a', startedAt: 1_000_000_000n }]) });

			await service.handleEgressEvent(snapshot);
			await service.handleEgressEvent(snapshot);

			expect(webhooks.events).toEqual([]);
			expect(frontend.signals).toEqual([]);
			expect(state.saves).toBe(0);
		});

		it('keeps an ending broadcast ending when a later event carries an older snapshot', async () => {
			await seed([liveRecord({ status: MeetBroadcastStatus.ENDING })]);

			await service.handleEgressEvent(
				egressWith({ streamResults: streams([{ tag: 'bc-a', startedAt: 1_000_000_000n }]) })
			);

			expect(saved()[0].status).toBe(MeetBroadcastStatus.ENDING);
			expect(webhooks.events).toEqual([]);
		});

		it('outwaits a change that a request would give up on, so the latest state is not dropped', async () => {
			await seed([liveRecord()]);
			mutex.busyAttempts = Infinity;
			await expectStatus(service.stopBroadcasts(ROOM_ID, { broadcastIds: ['bc-a'] }), 409);
			mutex.busyAttempts = mutex.attempts[0];

			await service.handleEgressEvent(
				egressWith({
					status: EgressStatus.EGRESS_ENDING,
					streamResults: streams([{ tag: 'bc-a', startedAt: 1_000_000_000n }])
				})
			);

			expect(saved()[0].status).toBe(MeetBroadcastStatus.ENDING);
		});

		it('gives up quietly when the room lock never frees', async () => {
			await seed([liveRecord()]);
			mutex.busyAttempts = Infinity;

			await expect(service.handleEgressEvent(egressWith({}))).resolves.toBeUndefined();
			expect(frontend.signals).toEqual([]);
		});
	});

	describe('handleEgressParticipantLeft', () => {
		const twoLive = () => [
			liveRecord(),
			liveRecord({ broadcastId: 'bc-b', destination: { name: 'B', url: REAL_URLS.b } })
		];

		beforeEach(() => {
			livekit.egressList = [egressWith({ streamResults: streams([{ startedAt: 1_000_000_000n }, {}]) })];
			livekit.egressInRoom = false;
		});

		it('ends the broadcasts as failed when their egress leaves the room and no longer answers', async () => {
			await seed(twoLive());
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
			await seed([liveRecord()]);

			await service.handleEgressParticipantLeft(ROOM_ID, 'EG_1');

			expect(livekit.probeCalls).toEqual(['EG_1']);
			expect(saved()[0].status).toBe(MeetBroadcastStatus.ACTIVE);
			expect(webhooks.events).toEqual([]);
		});

		it('does not even probe an egress that streams no broadcast, like a recording', async () => {
			await seed([liveRecord()]);
			livekit.reachable = false;

			await service.handleEgressParticipantLeft(ROOM_ID, 'EG_RECORDING');

			expect(livekit.probeCalls).toEqual([]);
			expect(saved()[0].status).toBe(MeetBroadcastStatus.ACTIVE);
		});
	});

	describe('reconcileAllRooms', () => {
		it('applies the latest snapshot of a healthy egress whose update never arrived, once', async () => {
			await seed([liveRecord({ status: MeetBroadcastStatus.STARTING, startDate: undefined })]);
			livekit.egressList = [egressWith({ streamResults: streams([{ startedAt: 2_000_000_000n }]) })];

			await service.reconcileAllRooms();
			await service.reconcileAllRooms();

			expect(saved()).toMatchObject([{ status: MeetBroadcastStatus.ACTIVE, startDate: 2000 }]);
			expect(webhookSummary()).toEqual(['broadcastUpdated:A:active']);
			expect(livekit.probeCalls).toEqual([]);
			expect(state.saves).toBe(1);
		});

		it('settles the broadcasts of an egress that ended without its egress_ended arriving', async () => {
			await seed([liveRecord()]);
			livekit.egressList = [
				egressWith({
					status: EgressStatus.EGRESS_FAILED,
					endedAt: 30_000_000_000n,
					error: 'boom',
					streamResults: streams([{ startedAt: 1_000_000_000n }])
				})
			];

			await service.reconcileAllRooms();

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:failed']);
		});

		it('fails the broadcasts of an egress whose service died while LiveKit still lists it in progress', async () => {
			await seed([liveRecord()]);
			livekit.egressList = [egressWith({})];
			livekit.egressInRoom = false;
			livekit.reachable = false;

			await service.reconcileAllRooms();

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:failed']);
		});

		it('ends the broadcasts of a meeting LiveKit no longer has, stopping its egress', async () => {
			await seed([liveRecord()]);
			livekit.roomLive = false;
			livekit.nextEgress = egressWith({ status: EgressStatus.EGRESS_ENDING });

			await service.reconcileAllRooms();

			expect(livekit.stopCalls).toEqual(['EG_1']);
			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete']);
		});

		it('leaves the broadcasts of a room alone when LiveKit cannot be asked, and goes on with the next rooms', async () => {
			await seed([liveRecord()]);
			await state.save('room-2', [liveRecord({ broadcastId: 'room-2--b', roomId: 'room-2' })]);
			livekit.roomExists = async () => {
				throw new Error('LiveKit unreachable');
			};

			await expect(service.reconcileAllRooms()).resolves.toBeUndefined();

			expect(saved()).toEqual([liveRecord()]);
			expect(webhooks.events).toEqual([]);
		});
	});

	describe('cleanupRoom', () => {
		it('ends the broadcasts of a meeting that finished before LiveKit reported the end', async () => {
			await seed([
				liveRecord(),
				liveRecord({ broadcastId: 'bc-b', destination: { name: 'B', url: REAL_URLS.b } })
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
			await seed([liveRecord({ status: MeetBroadcastStatus.STARTING, startDate: undefined })]);
			livekit.nextEgress = egressWith({ status: EgressStatus.EGRESS_ABORTED });

			await service.cleanupRoom(ROOM_ID);

			expect(livekit.stopCalls).toEqual(['EG_1']);
			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:aborted']);
		});

		it('settles with what LiveKit last reported, so a destination that just connected still counts', async () => {
			await seed([liveRecord({ status: MeetBroadcastStatus.STARTING, startDate: undefined })]);
			livekit.nextEgress = egressWith({
				status: EgressStatus.EGRESS_ENDING,
				streamResults: streams([{ startedAt: 5_000_000_000n }])
			});

			await service.cleanupRoom(ROOM_ID);

			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete']);
			expect(frontend.signals[0].startDate).toBe(5000);
		});

		it('takes an egress LiveKit already ended as ended, and settles with what LiveKit reports of it', async () => {
			await seed([liveRecord()]);
			livekit.alreadyEnded = true;
			livekit.egressList = [egressWith({ status: EgressStatus.EGRESS_COMPLETE })];

			await service.cleanupRoom(ROOM_ID);

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhookSummary()).toEqual(['broadcastEnded:A:complete']);
		});

		it('still settles the broadcasts when the egress cannot be stopped', async () => {
			await seed([liveRecord()]);
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
			await seed([liveRecord()]);
			const [broadcast] = await service.getBroadcasts(ROOM_ID);

			expect(broadcast.destination.url).toBe(REDACTED);
			expect(broadcast).not.toHaveProperty('egressId');
			expect(await service.isBroadcastActive(ROOM_ID)).toBe(true);
			expect((await service.getBroadcast(ROOM_ID, 'bc-a')).broadcastId).toBe('bc-a');
			await expectStatus(service.getBroadcast(ROOM_ID, 'bc-zzz'), 404);

			await state.save(ROOM_ID, []);
			expect(await service.getBroadcasts(ROOM_ID)).toEqual([]);
			expect(await service.isBroadcastActive(ROOM_ID)).toBe(false);
		});
	});
});

describe('BroadcastStateService', () => {
	const hashes = new Map<string, Map<string, string>>();
	const hash = (key: string) => hashes.get(key) ?? hashes.set(key, new Map()).get(key)!;
	const redis = {
		setHashField: async (key: string, field: string, value: string) => void hash(key).set(field, value),
		removeHashField: async (key: string, field: string) => void hash(key).delete(field),
		getHashField: async (key: string, field: string) => hash(key).get(field) ?? null,
		hasHashField: async (key: string, field: string) => hash(key).has(field),
		getHashFieldNames: async (key: string) => [...hash(key).keys()]
	};
	const stateService = new BroadcastStateService(redis as unknown as RedisService);

	it('keeps the broadcasts of each room as a field of one hash without expiry, until none is left', async () => {
		await stateService.save(ROOM_ID, [liveRecord()]);
		await stateService.save('room-2', [liveRecord({ roomId: 'room-2' })]);

		expect([...hashes.keys()]).toEqual([RedisKeyName.BROADCASTS]);
		expect(await stateService.find(ROOM_ID)).toEqual([liveRecord()]);
		expect(await stateService.findRoomIds()).toEqual([ROOM_ID, 'room-2']);
		expect(await stateService.hasBroadcasts(ROOM_ID)).toBe(true);

		await stateService.save(ROOM_ID, []);

		expect(await stateService.find(ROOM_ID)).toEqual([]);
		expect(await stateService.hasBroadcasts(ROOM_ID)).toBe(false);
		expect(await stateService.findRoomIds()).toEqual(['room-2']);
	});
});
