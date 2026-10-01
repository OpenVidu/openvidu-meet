import { beforeEach, describe, expect, it } from '@jest/globals';
import { EgressStatus, EncodingOptionsPreset, StreamInfo_Status } from '@livekit/protocol';
import type { MeetBroadcastInfo, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import {
	MEET_PERMISSION_KEYS,
	MeetBroadcastDestinationSource,
	MeetBroadcastDestinationStatus,
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

const allPermissions = (overrides: Partial<MeetRoomMemberPermissions> = {}): MeetRoomMemberPermissions => ({
	...(Object.fromEntries(MEET_PERMISSION_KEYS.map((key) => [key, true])) as unknown as MeetRoomMemberPermissions),
	...overrides
});

const egressWith = (overrides: Partial<EgressInfo>): EgressInfo =>
	({
		egressId: 'EG_1',
		roomName: ROOM_ID,
		status: EgressStatus.EGRESS_STARTING,
		startedAt: 0n,
		endedAt: 0n,
		errorCode: 0,
		error: '',
		details: '',
		streamResults: [],
		fileResults: [],
		...overrides
	}) as unknown as EgressInfo;

const runningRecord = (): BroadcastRecord => ({
	broadcastId: 'EG_1',
	roomId: ROOM_ID,
	roomName: 'Room',
	status: MeetBroadcastStatus.ACTIVE,
	layout: MeetRecordingLayout.GRID,
	encoding: MeetRecordingEncodingPreset.H264_720P_30,
	startDate: 1000,
	destinations: [
		{ id: 'a', name: 'A', url: REAL_URLS.a, source: MeetBroadcastDestinationSource.ROOM, status: 'active' },
		{ id: 'b', name: 'B', url: REAL_URLS.b, source: MeetBroadcastDestinationSource.ROOM, status: 'stopped' }
	] as BroadcastRecord['destinations']
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

	async updateStream(egressId: string, add: string[], remove: string[]): Promise<EgressInfo> {
		this.updateCalls.push({ egressId, add, remove });
		return this.nextEgress;
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
	records = new Map<string, BroadcastRecord>();

	async save(record: BroadcastRecord): Promise<void> {
		this.records.set(record.roomId, structuredClone(record));
	}

	async find(roomId: string): Promise<BroadcastRecord | null> {
		return this.records.get(roomId) ?? null;
	}

	async delete(roomId: string): Promise<void> {
		this.records.delete(roomId);
	}
}

class FakeRoomService {
	enabled = true;
	layout = MeetRecordingLayout.SPEAKER;
	encoding = MeetRecordingEncodingPreset.H264_1080P_30;
	permissions = allPermissions();

	async getMeetRoom() {
		return {
			roomName: 'Room',
			config: {
				broadcast: {
					enabled: this.enabled,
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

	async getAuthenticatedRoomMemberPermissions(): Promise<MeetRoomMemberPermissions> {
		return this.permissions;
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
	events: { type: MeetWebhookEventType; status: string }[] = [];

	sendBroadcastStartedWebhook(info: MeetBroadcastInfo) {
		this.events.push({ type: MeetWebhookEventType.BROADCAST_STARTED, status: info.status });
	}

	sendBroadcastUpdatedWebhook(info: MeetBroadcastInfo) {
		this.events.push({ type: MeetWebhookEventType.BROADCAST_UPDATED, status: info.status });
	}

	sendBroadcastEndedWebhook(info: MeetBroadcastInfo) {
		this.events.push({ type: MeetWebhookEventType.BROADCAST_ENDED, status: info.status });
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

	describe('startBroadcast', () => {
		it('starts a stream egress to the chosen destinations and keeps their real URLs server-side', async () => {
			const info = await service.startBroadcast(ROOM_ID, { destinations: [{ id: 'a' }] });

			expect(livekit.startCalls).toEqual([
				{
					roomName: ROOM_ID,
					urls: [REAL_URLS.a],
					layout: MeetRecordingLayout.SPEAKER,
					encodingOptions: EncodingOptionsPreset.H264_1080P_30
				}
			]);
			expect(info.layout).toBe(MeetRecordingLayout.SPEAKER);
			expect(info.encoding).toBe(MeetRecordingEncodingPreset.H264_1080P_30);
			expect(info.destinations.map(({ id, status, url }) => `${id}:${status}:${url}`)).toEqual([
				`a:connecting:${REDACTED}`,
				`b:stopped:${REDACTED}`
			]);
			expect(state.records.get(ROOM_ID)?.destinations.map(({ url }) => url)).toEqual([REAL_URLS.a, REAL_URLS.b]);
			expect(info.status).toBe(MeetBroadcastStatus.STARTING);
		});

		it('refuses a room with broadcast disabled, without participants, or already broadcasting', async () => {
			roomService.enabled = false;
			await expectStatus(service.startBroadcast(ROOM_ID, {}), 403);

			roomService.enabled = true;
			livekit.participants = false;
			await expectStatus(service.startBroadcast(ROOM_ID, {}), 409);

			livekit.participants = true;
			await state.save(runningRecord());
			livekit.egressList = [egressWith({ status: EgressStatus.EGRESS_ACTIVE })];
			await expectStatus(service.startBroadcast(ROOM_ID, {}), 409);
			expect(livekit.startCalls).toEqual([]);
		});

		it('drops a saved broadcast whose egress LiveKit no longer runs, then starts', async () => {
			await state.save(runningRecord());
			livekit.egressList = [egressWith({ status: EgressStatus.EGRESS_COMPLETE })];

			const info = await service.startBroadcast(ROOM_ID, {});

			expect(livekit.startCalls).toHaveLength(1);
			expect(info.destinations.every(({ status }) => status === 'connecting')).toBe(true);
		});

		it('waits for another change of the broadcast to finish instead of answering 409', async () => {
			mutex.busyAttempts = 3;

			await service.startBroadcast(ROOM_ID, {});

			expect(livekit.startCalls).toHaveLength(1);
		});

		it('answers 409 when another change holds the room lock for longer than a request waits', async () => {
			mutex.busyAttempts = Infinity;
			await expectStatus(service.startBroadcast(ROOM_ID, {}), 409);
			expect(livekit.startCalls).toEqual([]);
		});

		it('enforces the destination permissions of the caller', async () => {
			roomService.permissions = allPermissions({ broadcastAddDestinations: false });
			await expectStatus(
				service.startBroadcast(ROOM_ID, { destinations: [{ name: 'Extra', url: 'rtmp://mtx/live/x' }] }),
				403
			);

			roomService.permissions = allPermissions({ broadcastEditDestinations: false });
			await expectStatus(service.startBroadcast(ROOM_ID, { destinations: [{ id: 'a', name: 'Renamed' }] }), 403);
			await service.startBroadcast(ROOM_ID, { destinations: [{ id: 'a', name: 'A' }] });
			expect(livekit.startCalls).toHaveLength(1);
		});
	});

	describe('stopBroadcast', () => {
		it('stops the egress, saves the ending state and notifies', async () => {
			await state.save(runningRecord());
			livekit.nextEgress = egressWith({ status: EgressStatus.EGRESS_ENDING });

			const info = await service.stopBroadcast(ROOM_ID, 'EG_1');

			expect(livekit.stopCalls).toEqual(['EG_1']);
			expect(info.status).toBe(MeetBroadcastStatus.ENDING);
			expect(state.records.get(ROOM_ID)?.status).toBe(MeetBroadcastStatus.ENDING);
			expect(frontend.signals.map(({ status }) => status)).toEqual(['ending']);
			expect(webhooks.events).toEqual([{ type: MeetWebhookEventType.BROADCAST_UPDATED, status: 'ending' }]);
		});

		it('answers 404 for an unknown broadcast and 409 for one already stopping', async () => {
			await expectStatus(service.stopBroadcast(ROOM_ID, 'EG_1'), 404);

			await state.save({ ...runningRecord(), status: MeetBroadcastStatus.ENDING });
			await expectStatus(service.stopBroadcast(ROOM_ID, 'EG_1'), 409);
			expect(livekit.stopCalls).toEqual([]);
		});

		it('answers 409 when LiveKit ended the egress just before the stop, leaving the record to its webhook', async () => {
			await state.save(runningRecord());
			livekit.alreadyEnded = true;

			await expectStatus(service.stopBroadcast(ROOM_ID, 'EG_1'), 409);
			expect(state.records.get(ROOM_ID)?.status).toBe(MeetBroadcastStatus.ACTIVE);
			expect(webhooks.events).toEqual([]);
		});
	});

	describe('updateDestination', () => {
		beforeEach(async () => {
			await state.save(runningRecord());
			livekit.nextEgress = egressWith({ status: EgressStatus.EGRESS_ACTIVE });
		});

		it('removes the real URL from the egress to stop a destination', async () => {
			const info = await service.updateDestination(ROOM_ID, 'EG_1', 'a', { active: false });

			expect(livekit.updateCalls).toEqual([{ egressId: 'EG_1', add: [], remove: [REAL_URLS.a] }]);
			expect(info.destinations[0].status).toBe(MeetBroadcastDestinationStatus.STOPPED);
		});

		it('adds the real URL back to start a stopped destination, which connects anew', async () => {
			const info = await service.updateDestination(ROOM_ID, 'EG_1', 'b', { active: true });

			expect(livekit.updateCalls).toEqual([{ egressId: 'EG_1', add: [REAL_URLS.b], remove: [] }]);
			expect(info.destinations[1].status).toBe(MeetBroadcastDestinationStatus.CONNECTING);
			expect(webhooks.events).toEqual([{ type: MeetWebhookEventType.BROADCAST_UPDATED, status: 'active' }]);
		});

		it('does nothing when the destination is already in the requested state', async () => {
			await service.updateDestination(ROOM_ID, 'EG_1', 'a', { active: true });
			await service.updateDestination(ROOM_ID, 'EG_1', 'b', { active: false });

			expect(livekit.updateCalls).toEqual([]);
			expect(frontend.signals).toEqual([]);
		});

		it('answers 404 for an unknown destination and 409 once the broadcast is ending', async () => {
			await expectStatus(service.updateDestination(ROOM_ID, 'EG_1', 'zzz', { active: true }), 404);

			await state.save({ ...runningRecord(), status: MeetBroadcastStatus.ENDING });
			await expectStatus(service.updateDestination(ROOM_ID, 'EG_1', 'a', { active: false }), 409);
		});
	});

	describe('addDestination', () => {
		beforeEach(async () => {
			await state.save(runningRecord());
			livekit.nextEgress = egressWith({ status: EgressStatus.EGRESS_ACTIVE });
		});

		it("streams to the new URL right away and marks it as this meeting's", async () => {
			const info = await service.addDestination(ROOM_ID, 'EG_1', {
				name: 'Extra',
				url: 'rtmp://mtx/live/xxxKEYxxx'
			});

			expect(livekit.updateCalls).toEqual([{ egressId: 'EG_1', add: ['rtmp://mtx/live/xxxKEYxxx'], remove: [] }]);
			expect(info.destinations[2]).toMatchObject({
				name: 'Extra',
				source: 'meeting',
				status: 'connecting',
				url: REDACTED
			});
			expect(state.records.get(ROOM_ID)?.destinations[2].url).toBe('rtmp://mtx/live/xxxKEYxxx');
		});

		it('rejects a URL the broadcast already streams to', async () => {
			await expectStatus(service.addDestination(ROOM_ID, 'EG_1', { name: 'Again', url: REAL_URLS.a }), 422);
			expect(livekit.updateCalls).toEqual([]);
		});
	});

	describe('handleEgressEvent', () => {
		it('ignores an egress that is not the saved broadcast of the room', async () => {
			await state.save(runningRecord());

			await service.handleEgressEvent(egressWith({ egressId: 'EG_other' }), 'updated');

			expect(frontend.signals).toEqual([]);
			expect(webhooks.events).toEqual([]);
		});

		it('sends the started webhook and the signal for egress_started', async () => {
			await state.save({ ...runningRecord(), status: MeetBroadcastStatus.STARTING });

			await service.handleEgressEvent(egressWith({}), 'started');

			expect(webhooks.events).toEqual([{ type: MeetWebhookEventType.BROADCAST_STARTED, status: 'starting' }]);
			expect(frontend.signals).toHaveLength(1);
		});

		it('settles and forgets the broadcast on egress_ended, with the destinations LiveKit reports', async () => {
			await state.save(runningRecord());

			await service.handleEgressEvent(
				egressWith({
					status: EgressStatus.EGRESS_COMPLETE,
					endedAt: 61_000_000_000n,
					streamResults: [
						{
							url: 'rtmp://mtx/live/{aaa...aaa}',
							status: StreamInfo_Status.FINISHED,
							startedAt: 1_000_000_000n,
							endedAt: 61_000_000_000n,
							duration: 60_000_000_000n,
							error: ''
						}
					]
				} as unknown as Partial<EgressInfo>),
				'ended'
			);

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhooks.events).toEqual([{ type: MeetWebhookEventType.BROADCAST_ENDED, status: 'complete' }]);
			expect(frontend.signals[0].destinations[0]).toMatchObject({ status: 'stopped', duration: 60 });
			expect(frontend.signals[0].destinations[0].url).toBe(REDACTED);
		});

		it('drops an egress_updated that changes nothing, as LiveKit sends after a request made the change', async () => {
			await state.save(runningRecord());
			livekit.nextEgress = egressWith({ status: EgressStatus.EGRESS_ENDING });
			await service.stopBroadcast(ROOM_ID, 'EG_1');

			await service.handleEgressEvent(egressWith({ status: EgressStatus.EGRESS_ENDING }), 'updated');

			expect(webhooks.events).toEqual([{ type: MeetWebhookEventType.BROADCAST_UPDATED, status: 'ending' }]);
			expect(frontend.signals).toHaveLength(1);
		});

		it('outwaits a change that a request would give up on, so the latest state is not dropped', async () => {
			await state.save(runningRecord());
			mutex.busyAttempts = Infinity;
			await expectStatus(service.updateDestination(ROOM_ID, 'EG_1', 'a', { active: false }), 409);
			mutex.busyAttempts = mutex.attempts[0];

			await service.handleEgressEvent(egressWith({ status: EgressStatus.EGRESS_ENDING }), 'updated');

			expect(state.records.get(ROOM_ID)?.status).toBe(MeetBroadcastStatus.ENDING);
		});

		it('gives up quietly when the room lock never frees', async () => {
			await state.save(runningRecord());
			mutex.busyAttempts = Infinity;

			await expect(service.handleEgressEvent(egressWith({}), 'updated')).resolves.toBeUndefined();
			expect(frontend.signals).toEqual([]);
		});
	});

	describe('handleEgressParticipantLeft', () => {
		it('ends the broadcast as failed when its egress leaves the room and no longer answers', async () => {
			await state.save(runningRecord());
			livekit.reachable = false;

			await service.handleEgressParticipantLeft(ROOM_ID, 'EG_1');

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhooks.events).toEqual([{ type: MeetWebhookEventType.BROADCAST_ENDED, status: 'failed' }]);
			expect(frontend.signals[0]).toMatchObject({ status: 'failed', error: expect.any(String) });
			expect(frontend.signals[0].destinations.map(({ status }) => status)).toEqual(['stopped', 'stopped']);
		});

		it('leaves the broadcast alone while its egress still answers', async () => {
			await state.save(runningRecord());

			await service.handleEgressParticipantLeft(ROOM_ID, 'EG_1');

			expect(livekit.probeCalls).toEqual(['EG_1']);
			expect(state.records.get(ROOM_ID)?.status).toBe(MeetBroadcastStatus.ACTIVE);
			expect(webhooks.events).toEqual([]);
		});

		it('does not even probe an egress that is not the running broadcast, like a recording', async () => {
			await state.save(runningRecord());
			livekit.reachable = false;

			await service.handleEgressParticipantLeft(ROOM_ID, 'EG_RECORDING');

			expect(livekit.probeCalls).toEqual([]);
			expect(state.records.get(ROOM_ID)?.status).toBe(MeetBroadcastStatus.ACTIVE);
		});
	});

	describe('cleanupRoom', () => {
		it('ends a broadcast whose meeting finished before LiveKit reported the end', async () => {
			await state.save(runningRecord());

			await service.cleanupRoom(ROOM_ID);

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhooks.events).toEqual([{ type: MeetWebhookEventType.BROADCAST_ENDED, status: 'complete' }]);
			expect(frontend.signals[0].destinations.map(({ status }) => status)).toEqual(['stopped', 'stopped']);
		});

		it('stops an egress still starting, which would outlive the room, and reports the broadcast aborted', async () => {
			await state.save({ ...runningRecord(), status: MeetBroadcastStatus.STARTING, startDate: undefined });
			livekit.nextEgress = egressWith({ status: EgressStatus.EGRESS_ABORTED });

			await service.cleanupRoom(ROOM_ID);

			expect(livekit.stopCalls).toEqual(['EG_1']);
			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhooks.events).toEqual([{ type: MeetWebhookEventType.BROADCAST_ENDED, status: 'aborted' }]);
		});

		it('settles with what LiveKit last reported, so a destination that just connected still counts', async () => {
			await state.save({ ...runningRecord(), startDate: undefined });
			livekit.nextEgress = egressWith({
				status: EgressStatus.EGRESS_ENDING,
				streamResults: [
					{
						url: 'rtmp://mtx/live/{aaa...aaa}',
						status: StreamInfo_Status.ACTIVE,
						startedAt: 5_000_000_000n,
						endedAt: 0n
					}
				] as unknown as EgressInfo['streamResults']
			});

			await service.cleanupRoom(ROOM_ID);

			expect(webhooks.events).toEqual([{ type: MeetWebhookEventType.BROADCAST_ENDED, status: 'complete' }]);
		});

		it('takes an egress LiveKit already ended as ended, and settles with what LiveKit reports of it', async () => {
			await state.save(runningRecord());
			livekit.alreadyEnded = true;
			livekit.egressList = [egressWith({ status: EgressStatus.EGRESS_COMPLETE })];

			await service.cleanupRoom(ROOM_ID);

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhooks.events).toEqual([{ type: MeetWebhookEventType.BROADCAST_ENDED, status: 'complete' }]);
		});

		it('still settles the broadcast when the egress cannot be stopped', async () => {
			await state.save(runningRecord());
			livekit.stopFails = true;

			await service.cleanupRoom(ROOM_ID);

			expect(state.records.has(ROOM_ID)).toBe(false);
			expect(webhooks.events).toEqual([{ type: MeetWebhookEventType.BROADCAST_ENDED, status: 'complete' }]);
		});

		it('does nothing for a room without a broadcast', async () => {
			await service.cleanupRoom(ROOM_ID);

			expect(webhooks.events).toEqual([]);
		});
	});

	describe('findActiveBroadcast', () => {
		it('reports the broadcast while it is in progress, redacted, and nothing afterwards', async () => {
			await state.save(runningRecord());
			expect((await service.findActiveBroadcast(ROOM_ID))?.destinations[0].url).toBe(REDACTED);
			expect(await service.isBroadcastActive(ROOM_ID)).toBe(true);

			await state.save({ ...runningRecord(), status: MeetBroadcastStatus.COMPLETE });
			expect(await service.findActiveBroadcast(ROOM_ID)).toBeNull();
			expect(await service.isBroadcastActive(ROOM_ID)).toBe(false);
		});
	});
});
