import { describe, expect, it } from '@jest/globals';
import { ParticipantInfo_Kind } from '@livekit/protocol';
import type { MeetRecordingInfo } from '@openvidu-meet/typings';
import { MeetingEndAction, MeetMeetingEndedReason, MeetRecordingStatus, MeetRoomStatus } from '@openvidu-meet/typings';
import type { ParticipantInfo, Room } from 'livekit-server-sdk';
import { EgressInfo, EgressStatus } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { EGRESS_LOST_ERROR } from '../../../src/models/egress.model.js';
import { LivekitWebhookService } from '../../../src/services/livekit-webhook.service.js';
import type { RoomScheduledTasksService } from '../../../src/services/room-scheduled-tasks.service.js';

class FakeRedisService {
	store = new Map<string, string>();

	async get(key: string): Promise<string | null> {
		return this.store.get(key) ?? null;
	}

	async set(key: string, value: string): Promise<string> {
		this.store.set(key, value);
		return 'OK';
	}

	async delete(key: string): Promise<number> {
		return this.store.delete(key) ? 1 : 0;
	}
}

class TestableLivekitWebhookService extends LivekitWebhookService {
	runGetMeetingEndedReason(roomId: string, meetingId?: string): Promise<MeetMeetingEndedReason | undefined> {
		return this.getMeetingEndedReason(roomId, meetingId);
	}
}

const buildService = (redis: FakeRedisService) =>
	new TestableLivekitWebhookService(
		...([{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, redis, {}] as unknown as ConstructorParameters<
			typeof LivekitWebhookService
		>)
	);

/**
 * Reads the MEETING_ENDED_REASON flag that RoomScheduledTasksService stamps before force-ending a
 * meeting for exceeding its duration limit, deciding whether the meetingEnded webhook carries an
 * attributed reason instead of reading as a moderator's own end.
 */
describe('LivekitWebhookService.getMeetingEndedReason (force-end attribution flag)', () => {
	it('is undefined when no flag was ever set (a normal end)', async () => {
		const service = buildService(new FakeRedisService());

		await expect(service.runGetMeetingEndedReason('room-1', 'sid-N')).resolves.toBeUndefined();
	});

	it('is MAX_DURATION_REACHED when the flag matches the finishing meeting', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-N');
		const service = buildService(redis);

		await expect(service.runGetMeetingEndedReason('room-1', 'sid-N')).resolves.toBe(
			MeetMeetingEndedReason.MAX_DURATION_REACHED
		);
	});

	it('is undefined when the flag belongs to a different (stale) meeting in the same room', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-OLD');
		const service = buildService(redis);

		await expect(service.runGetMeetingEndedReason('room-1', 'sid-NEW')).resolves.toBeUndefined();
	});

	it('consumes the flag, so it can only ever attribute one end', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-N');
		const service = buildService(redis);

		await expect(service.runGetMeetingEndedReason('room-1', 'sid-N')).resolves.toBe(
			MeetMeetingEndedReason.MAX_DURATION_REACHED
		);
		expect(redis.store.has('ov_meet:meeting_ended_reason:room-1')).toBe(false);
	});

	it('leaves a flag it did not attribute standing, for the end it belongs to', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-OLD');
		const service = buildService(redis);

		await service.runGetMeetingEndedReason('room-1', 'sid-NEW');

		expect(redis.store.get('ov_meet:meeting_ended_reason:room-1')).toBe('sid-OLD');
	});

	// The reconcile GC reports an end it found by noticing the room is gone from LiveKit, which is
	// also why it cannot name the meeting: there is no sid left to compare the flag against.
	it('attributes a standing flag to a caller that cannot name the finishing meeting', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-N');
		const service = buildService(redis);

		await expect(service.runGetMeetingEndedReason('room-1')).resolves.toBe(
			MeetMeetingEndedReason.MAX_DURATION_REACHED
		);
	});

	it('reports no reason to that caller when no flag stands', async () => {
		const service = buildService(new FakeRedisService());

		await expect(service.runGetMeetingEndedReason('room-1')).resolves.toBeUndefined();
	});
});

class FakeLogger {
	info() {}
	warn() {}
	error() {}
	debug() {}
	verbose() {}
}

class FakeRoomService {
	constructor(
		private status: MeetRoomStatus,
		readonly maxDurationMinutes?: number
	) {}

	async getMeetRoom() {
		return { status: this.status, config: { maxDurationMinutes: this.maxDurationMinutes } };
	}
}

class FakeRoomScheduledTasksService {
	scheduled: { room: Room; maxDurationMinutes: number }[] = [];
	cancelled: string[] = [];

	scheduleMeetingEndAtDurationLimit(room: Room, maxDurationMinutes: number): void {
		this.scheduled.push({ room, maxDurationMinutes });
	}

	cancelMeetingEndAtDurationLimit(roomId: string): void {
		this.cancelled.push(roomId);
	}
}

class FakeRoomRepository {
	activateMeetingCalls: string[] = [];
	/** Mirrors `activateMeeting`'s real contract: `null` simulates the room no longer being OPEN. */
	activateMeetingResult: { config: { maxDurationMinutes?: number } } | null = { config: {} };
	/**
	 * Mirrors `finishMeeting`'s real contract: the first call ends the room's meeting and gets the
	 * room as the end left it, every later one finds no meeting to end. `null` simulates a room that
	 * was not `active_meeting` in the first place.
	 */
	endedRoom: { roomId: string; status: MeetRoomStatus; meetingEndAction: MeetingEndAction } | null = {
		roomId: 'room-1',
		status: MeetRoomStatus.OPEN,
		meetingEndAction: MeetingEndAction.NONE
	};

	async activateMeeting(roomId: string) {
		this.activateMeetingCalls.push(roomId);

		if (!this.activateMeetingResult) {
			return null;
		}

		return { roomId, status: MeetRoomStatus.ACTIVE_MEETING, ...this.activateMeetingResult };
	}

	async finishMeeting() {
		const endedRoom = this.endedRoom;
		this.endedRoom = null;
		return endedRoom;
	}
}

class FakeLiveKitService {
	deleteRoomCalls: string[] = [];

	async deleteRoom(roomId: string) {
		this.deleteRoomCalls.push(roomId);
		return true;
	}
}

class FakeWebhookDispatcherService {
	sendMeetingStartedWebhookCalls: unknown[] = [];
	sendMeetingEndedWebhookRooms: unknown[] = [];
	sendMeetingEndedWebhookReasons: (MeetMeetingEndedReason | undefined)[] = [];

	sendMeetingStartedWebhook(room: unknown) {
		this.sendMeetingStartedWebhookCalls.push(room);
	}

	sendMeetingEndedWebhook(room: unknown, reason?: MeetMeetingEndedReason) {
		this.sendMeetingEndedWebhookRooms.push(room);
		this.sendMeetingEndedWebhookReasons.push(reason);
	}
}

class TestableRoomLifecycleService extends LivekitWebhookService {
	readonly roomScheduledTasks = new FakeRoomScheduledTasksService();

	protected override getRoomScheduledTasksService(): Promise<RoomScheduledTasksService> {
		return Promise.resolve(this.roomScheduledTasks as unknown as RoomScheduledTasksService);
	}
}

const buildRoomStartedService = (roomService: FakeRoomService) => {
	const roomRepository = new FakeRoomRepository();
	roomRepository.activateMeetingResult = { config: { maxDurationMinutes: roomService.maxDurationMinutes } };
	const livekitService = new FakeLiveKitService();
	const webhookDispatcherService = new FakeWebhookDispatcherService();
	const service = new TestableRoomLifecycleService(
		...([
			{},
			{},
			livekitService,
			roomService,
			roomRepository,
			webhookDispatcherService,
			{},
			{},
			{},
			{},
			{},
			{},
			{},
			new FakeLogger()
		] as unknown as ConstructorParameters<typeof LivekitWebhookService>)
	);

	return { service, roomRepository, livekitService, webhookDispatcherService };
};

describe('LivekitWebhookService.handleRoomStarted (closed rooms are not reactivated)', () => {
	it('leaves a closed room closed and deletes the LiveKit room instead of reactivating it', async () => {
		const { service, roomRepository, livekitService, webhookDispatcherService } = buildRoomStartedService(
			new FakeRoomService(MeetRoomStatus.CLOSED)
		);

		await service.handleRoomStarted({ name: 'room-1', sid: 'sid-1' } as unknown as Room);

		expect(roomRepository.activateMeetingCalls).toEqual([]);
		expect(webhookDispatcherService.sendMeetingStartedWebhookCalls).toEqual([]);
		expect(livekitService.deleteRoomCalls).toEqual(['room-1']);
	});

	it('activates an open room and sends the meeting-started webhook', async () => {
		const { service, roomRepository, livekitService, webhookDispatcherService } = buildRoomStartedService(
			new FakeRoomService(MeetRoomStatus.OPEN)
		);

		await service.handleRoomStarted({ name: 'room-1', sid: 'sid-1' } as unknown as Room);

		expect(roomRepository.activateMeetingCalls).toEqual(['room-1']);
		expect(webhookDispatcherService.sendMeetingStartedWebhookCalls).toHaveLength(1);
		expect(livekitService.deleteRoomCalls).toEqual([]);
	});

	// G2: a late or reordered room_started (a LiveKit retry, or the reconciler racing room_finished)
	// must not resurrect a room that moved on between the CLOSED check and the atomic write.
	it('ignores a stale room_started when the room is no longer open by the time of the atomic write', async () => {
		const { service, roomRepository, webhookDispatcherService } = buildRoomStartedService(
			new FakeRoomService(MeetRoomStatus.OPEN)
		);
		roomRepository.activateMeetingResult = null;

		await service.handleRoomStarted({ name: 'room-1', sid: 'sid-1' } as unknown as Room);

		expect(roomRepository.activateMeetingCalls).toEqual(['room-1']);
		expect(webhookDispatcherService.sendMeetingStartedWebhookCalls).toEqual([]);
	});
});

/**
 * D1 (MEET-MEETING-DURATION-PRECISION-PLAN.md): the duration limit is enforced by a timer armed for
 * the meeting's own deadline, so `room_started` is where it gets armed and `room_finished` is where
 * it gets disarmed.
 */
describe('LivekitWebhookService duration-limit timer wiring', () => {
	const startedRoom = { name: 'room-1', sid: 'sid-1', creationTime: 1_700_000_000 } as unknown as Room;

	// The started room itself is handed over, not just its id: the timer's deadline is that room's
	// own creation time plus the limit.
	it('arms the timer with the room limit when a limited meeting starts', async () => {
		const { service } = buildRoomStartedService(new FakeRoomService(MeetRoomStatus.OPEN, 30));

		await service.handleRoomStarted(startedRoom);

		expect(service.roomScheduledTasks.scheduled).toEqual([{ room: startedRoom, maxDurationMinutes: 30 }]);
	});

	it('arms nothing for a room without a duration limit', async () => {
		const { service } = buildRoomStartedService(new FakeRoomService(MeetRoomStatus.OPEN));

		await service.handleRoomStarted(startedRoom);

		expect(service.roomScheduledTasks.scheduled).toEqual([]);
	});

	it('arms nothing for a closed room, whose resurrected LiveKit room is deleted instead', async () => {
		const { service } = buildRoomStartedService(new FakeRoomService(MeetRoomStatus.CLOSED, 30));

		await service.handleRoomStarted(startedRoom);

		expect(service.roomScheduledTasks.scheduled).toEqual([]);
	});

	it('arms nothing for a stale event that does not transition the room', async () => {
		const { service, roomRepository } = buildRoomStartedService(new FakeRoomService(MeetRoomStatus.OPEN, 30));
		roomRepository.activateMeetingResult = null;

		await service.handleRoomStarted(startedRoom);

		expect(service.roomScheduledTasks.scheduled).toEqual([]);
	});

	it('disarms the timer when the meeting finishes by any other means', async () => {
		const service = new TestableRoomLifecycleService(
			...([
				{ reactivateAutoRecording: async () => {}, releaseRecordingLockIfNoEgress: async () => {} },
				{},
				new FakeLiveKitService(),
				{},
				new FakeRoomRepository(),
				{ sendMeetingEndedWebhook: () => {} },
				{},
				{ cleanupParticipantNames: async () => {} },
				{ removeRoomFromAllUsers: async () => {} },
				{},
				{ cleanupState: async () => {} },
				{},
				new FakeRedisService(),
				new FakeLogger()
			] as unknown as ConstructorParameters<typeof LivekitWebhookService>)
		);

		await service.handleRoomFinished({ name: 'room-1', sid: 'sid-1' } as unknown as Room);

		expect(service.roomScheduledTasks.cancelled).toEqual(['room-1']);
	});
});

/**
 * C7: the reconcile GC reports an end it discovered by noticing the room is gone from LiveKit, so it
 * hands over the room id and nothing else. Reaching the handler through its own front door is what
 * covers the seam the previous tests straddled: one side asserted the flag reader in isolation, the
 * other used a double that ignored the sid, and the synthetic `Room` between them type-checked.
 */
describe('LivekitWebhookService.handleRoomFinished', () => {
	const buildFinishedService = (redis: FakeRedisService) => {
		const webhookDispatcherService = new FakeWebhookDispatcherService();
		const roomRepository = new FakeRoomRepository();
		const cleanups: string[] = [];
		const record = (name: string) => async (roomId: string) => {
			cleanups.push(`${name}(${roomId})`);
		};
		const service = new TestableRoomLifecycleService(
			...([
				{
					reactivateAutoRecording: async () => {},
					releaseRecordingLockIfNoEgress: record('releaseRecordingLockIfNoEgress'),
					deleteAllRoomRecordings: record('deleteAllRoomRecordings')
				},
				{},
				new FakeLiveKitService(),
				{},
				roomRepository,
				webhookDispatcherService,
				{},
				{ cleanupParticipantNames: record('cleanupParticipantNames') },
				{ removeRoomFromAllUsers: record('removeRoomFromAllUsers') },
				{ deleteAllByRoomId: record('deleteAllByRoomId') },
				{ cleanupState: record('cleanupState') },
				{},
				redis,
				new FakeLogger(),
				{ cleanupRoom: record('cleanupRoom') }
			] as unknown as ConstructorParameters<typeof LivekitWebhookService>)
		);

		return { service, webhookDispatcherService, roomRepository, cleanups };
	};

	it('sends meetingEnded with the room as the end left it and runs every cleanup', async () => {
		const { service, roomRepository, webhookDispatcherService, cleanups } = buildFinishedService(
			new FakeRedisService()
		);
		const endedRoom = roomRepository.endedRoom;

		await service.handleRoomFinished({ name: 'room-1', sid: 'sid-1' });

		expect(webhookDispatcherService.sendMeetingEndedWebhookRooms).toEqual([endedRoom]);
		expect(cleanups.sort()).toEqual([
			'cleanupParticipantNames(room-1)',
			'cleanupRoom(room-1)',
			'cleanupState(room-1)',
			'releaseRecordingLockIfNoEgress(room-1)',
			'removeRoomFromAllUsers(room-1)'
		]);
	});

	it('also deletes the members and recordings of a room the end deleted', async () => {
		const { service, roomRepository, cleanups } = buildFinishedService(new FakeRedisService());
		roomRepository.endedRoom = {
			roomId: 'room-1',
			status: MeetRoomStatus.ACTIVE_MEETING,
			meetingEndAction: MeetingEndAction.DELETE
		};

		await service.handleRoomFinished({ name: 'room-1', sid: 'sid-1' });

		expect(cleanups).toContain('deleteAllRoomRecordings(room-1)');
		expect(cleanups).toContain('deleteAllByRoomId(room-1)');
	});

	it('sends one meetingEnded when the same end is reported twice at once', async () => {
		const { service, webhookDispatcherService, cleanups } = buildFinishedService(new FakeRedisService());

		await Promise.all([
			service.handleRoomFinished({ name: 'room-1', sid: 'sid-1' }),
			service.handleRoomFinished({ name: 'room-1' })
		]);

		expect(webhookDispatcherService.sendMeetingEndedWebhookRooms).toHaveLength(1);
		expect(cleanups.filter((cleanup) => cleanup.startsWith('cleanupParticipantNames'))).toHaveLength(1);
	});

	it('sends nothing and cleans nothing up for a room with no meeting to end', async () => {
		const { service, roomRepository, webhookDispatcherService, cleanups } = buildFinishedService(
			new FakeRedisService()
		);
		roomRepository.endedRoom = null;

		await service.handleRoomFinished({ name: 'room-1', sid: 'sid-1' });

		expect(webhookDispatcherService.sendMeetingEndedWebhookRooms).toEqual([]);
		expect(cleanups).toEqual([]);
	});

	it('attributes the end to the duration limit for a caller that knows only the room', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-N');
		const { service, webhookDispatcherService } = buildFinishedService(redis);

		await service.handleRoomFinished({ name: 'room-1' });

		expect(webhookDispatcherService.sendMeetingEndedWebhookReasons).toEqual([
			MeetMeetingEndedReason.MAX_DURATION_REACHED
		]);
	});

	it('reports a normal end when no force-end flag stands', async () => {
		const { service, webhookDispatcherService } = buildFinishedService(new FakeRedisService());

		await service.handleRoomFinished({ name: 'room-1' });

		expect(webhookDispatcherService.sendMeetingEndedWebhookReasons).toEqual([undefined]);
	});

	it('still scopes the attribution to the meeting when the caller names it', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-OLD');
		const { service, webhookDispatcherService } = buildFinishedService(redis);

		await service.handleRoomFinished({ name: 'room-1', sid: 'sid-NEW' });

		expect(webhookDispatcherService.sendMeetingEndedWebhookReasons).toEqual([undefined]);
	});
});

describe('LivekitWebhookService.handleParticipantLeft (an egress leaving the room)', () => {
	const RECORDING_ID = 'room-1--EG_1--uid1';
	const broadcastEgress = new EgressInfo({ egressId: 'EG_1', roomName: 'room-1', streamResults: [{}] });
	const recordingEgress = new EgressInfo({
		egressId: 'EG_1',
		roomName: 'room-1',
		status: EgressStatus.EGRESS_ACTIVE,
		fileResults: [{ filename: 'room-1--uid1.mp4' }]
	});

	const buildEgressLeftService = (
		egress: EgressInfo,
		{ recordingStatus = MeetRecordingStatus.ACTIVE, reachable = false } = {}
	) => {
		const departures: { roomId: string; egressId: string }[] = [];
		const released: string[] = [];
		const finished: MeetRecordingInfo[] = [];
		const service = new LivekitWebhookService(
			...([
				{
					finishRecording: async (recording: MeetRecordingInfo) => {
						finished.push(recording);
						return true;
					}
				},
				{
					findByRecordingId: async (recordingId: string) => ({
						recordingId,
						roomId: 'room-1',
						status: recordingStatus
					})
				},
				{ getEgress: async () => [egress], isEgressReachable: async () => reachable },
				{},
				{},
				{},
				{},
				{ releaseParticipantName: async (_roomId: string, name: string) => released.push(name) },
				{},
				{},
				{},
				{},
				new FakeRedisService(),
				new FakeLogger(),
				{
					handleEgressParticipantLeft: async (roomId: string, egressId: string) =>
						departures.push({ roomId, egressId })
				}
			] as unknown as ConstructorParameters<typeof LivekitWebhookService>)
		);
		const leave = () =>
			service.handleParticipantLeft(
				{ name: 'room-1' } as Room,
				{ identity: 'EG_1', name: 'EG_1', kind: ParticipantInfo_Kind.EGRESS } as ParticipantInfo
			);

		return { leave, departures, released, finished };
	};

	it('hands the departure of a broadcast egress to the broadcast, as no participant of the meeting', async () => {
		const { leave, departures, released, finished } = buildEgressLeftService(broadcastEgress);

		await leave();

		expect(departures).toEqual([{ roomId: 'room-1', egressId: 'EG_1' }]);
		expect(released).toEqual([]);
		expect(finished).toEqual([]);
	});

	it('ends as failed a recording in progress whose egress no longer answers', async () => {
		const { leave, departures, finished } = buildEgressLeftService(recordingEgress);

		await leave();

		expect(finished).toEqual([
			expect.objectContaining({
				recordingId: RECORDING_ID,
				status: MeetRecordingStatus.FAILED,
				error: EGRESS_LOST_ERROR,
				endDate: expect.any(Number)
			})
		]);
		expect(departures).toEqual([]);
	});

	it.each([
		['its egress still answers', { reachable: true }],
		['the recording has already ended', { recordingStatus: MeetRecordingStatus.COMPLETE }]
	])('leaves the recording alone when %s', async (_case, state) => {
		const { leave, finished } = buildEgressLeftService(recordingEgress, state);

		await leave();

		expect(finished).toEqual([]);
	});
});
