import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ParticipantInfo_Kind } from '@livekit/protocol';
import type { MeetRecordingInfo, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import {
	MEET_PERMISSION_KEYS,
	MeetingEndAction,
	MeetMeetingEndedReason,
	MeetRecordingStatus,
	MeetRoomMemberUIBadge,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import type { ParticipantInfo, Room } from 'livekit-server-sdk';
import { AccessToken, EgressInfo, EgressStatus } from 'livekit-server-sdk';
import crypto from 'crypto';
// LivekitWebhookService is in an import cycle with the DI container module, which therefore has to be
// evaluated first: otherwise RoomScheduledTasksService declares `@inject(LivekitWebhookService)` before it exists.
import { container, registerDependencies } from '../../../src/config/dependency-injector.config.js';
import { MEET_ENV } from '../../../src/environment.js';
import { RecordingHelper } from '../../../src/helpers/recording.helper.js';
import { EGRESS_LOST_ERROR } from '../../../src/models/egress.model.js';
import { RoomRepository } from '../../../src/repositories/room.repository.js';
import { LivekitWebhookService } from '../../../src/services/livekit-webhook.service.js';
import { RedisService } from '../../../src/services/redis.service.js';
import type { RoomScheduledTasksService } from '../../../src/services/room-scheduled-tasks.service.js';
import { TokenService } from '../../../src/services/token.service.js';

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

	it('does nothing when the media server no longer lists the egress that left', async () => {
		const service = new LivekitWebhookService(
			...([
				{},
				{},
				{ getEgress: async () => [] },
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				new FakeLogger(),
				{}
			] as unknown as ConstructorParameters<typeof LivekitWebhookService>)
		);

		await expect(
			service.handleParticipantLeft(
				{ name: 'room-1' } as Room,
				{ identity: 'EG_1', kind: ParticipantInfo_Kind.EGRESS } as ParticipantInfo
			)
		).resolves.toBeUndefined();
	});

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

describe('LivekitWebhookService.handleEgressUpdated', () => {
	let reported: MeetRecordingInfo;

	const buildUpdatedService = (storedStatus: MeetRecordingStatus) => {
		const stored = { recordingId: 'room-1--EG_1--uid', roomId: 'room-1', status: storedStatus };
		const inProgress = [MeetRecordingStatus.STARTING, MeetRecordingStatus.ACTIVE, MeetRecordingStatus.ENDING];
		const repository = {
			replaceInProgress: async (recording: MeetRecordingInfo) => {
				if (!inProgress.includes(stored.status)) return null;

				stored.status = recording.status;
				return recording;
			}
		};
		const webhooks: MeetRecordingInfo[] = [];
		const signals: MeetRecordingInfo[] = [];
		const service = new LivekitWebhookService(
			...([
				{ toRecordingInfo: async () => reported },
				repository,
				{},
				{},
				{},
				{ sendRecordingUpdatedWebhook: (recording: MeetRecordingInfo) => webhooks.push(recording) },
				{
					sendRecordingUpdatedSignal: async (_roomId: string, recording: MeetRecordingInfo) =>
						signals.push(recording)
				},
				{},
				{},
				{},
				{},
				{},
				{},
				new FakeLogger()
			] as unknown as ConstructorParameters<typeof LivekitWebhookService>)
		);
		return { service, stored, webhooks, signals };
	};

	const egressReporting = (status: MeetRecordingStatus) => {
		reported = { recordingId: 'room-1--EG_1--uid', roomId: 'room-1', status } as MeetRecordingInfo;
		return new EgressInfo({ fileResults: [{}] });
	};

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('stores and reports an update of a recording in progress', async () => {
		const { service, stored, webhooks, signals } = buildUpdatedService(MeetRecordingStatus.STARTING);

		await service.handleEgressUpdated(egressReporting(MeetRecordingStatus.ACTIVE));

		expect(stored.status).toBe(MeetRecordingStatus.ACTIVE);
		expect(webhooks).toHaveLength(1);
		expect(signals).toHaveLength(1);
	});

	it('ignores an update that arrives after the recording ended', async () => {
		const { service, stored, webhooks, signals } = buildUpdatedService(MeetRecordingStatus.COMPLETE);

		await service.handleEgressUpdated(egressReporting(MeetRecordingStatus.ENDING));

		expect(stored.status).toBe(MeetRecordingStatus.COMPLETE);
		expect(webhooks).toEqual([]);
		expect(signals).toEqual([]);
	});
});

// The media server accepts a token until it expires, so a client can reconnect with one a demotion or a member
// update revoked; Meet hears of that session only through its join.
describe('LivekitWebhookService.handleParticipantJoined (a session that joined with a revoked token)', () => {
	const ROOM = {
		name: 'room-1',
		sid: 'RM_1',
		metadata: JSON.stringify({ roomOptions: { roomName: 'Room 1' } })
	} as Room;
	const IDENTITY = 'speaker-1';
	const DEMOTED_AT = 2_000;
	const redis = new FakeRedisService();
	let liveParticipant: ParticipantInfo;
	let deleteParticipant: jest.Mock<(roomId: string, identity: string) => Promise<void>>;
	let webhookDispatcherService: { sendParticipantJoinedWebhook: jest.Mock; sendParticipantLeftWebhook: jest.Mock };
	let service: LivekitWebhookService;

	const ISSUED_BEFORE_DEMOTION = {};
	const ISSUED_AFTER_DEMOTION = { issuedAfterRevocation: DEMOTED_AT };

	const session = (issue?: { issuedAfterRevocation?: number }): ParticipantInfo =>
		({
			identity: IDENTITY,
			kind: ParticipantInfo_Kind.STANDARD,
			sid: 'PA_1',
			name: 'Ana',
			metadata:
				issue === undefined
					? ''
					: JSON.stringify({
							iat: DEMOTED_AT,
							...issue,
							roomId: ROOM.name,
							permissions: Object.fromEntries(
								MEET_PERMISSION_KEYS.map((key) => [key, false])
							) as unknown as MeetRoomMemberPermissions,
							badge: MeetRoomMemberUIBadge.OTHER
						})
		}) as ParticipantInfo;

	beforeAll(() => {
		registerDependencies();
		container.rebind(RedisService).toConstantValue(redis as unknown as RedisService);
	});

	beforeEach(() => {
		redis.store.clear();
		redis.store.set(`ov_meet:participant_tokens_revoked_at:${ROOM.name}:${IDENTITY}`, String(DEMOTED_AT));
		jest.spyOn(container.get(RoomRepository), 'findByRoomId').mockResolvedValue({ rolesUpdatedAt: 0 } as never);
		deleteParticipant = jest.fn(async () => {});
		webhookDispatcherService = { sendParticipantJoinedWebhook: jest.fn(), sendParticipantLeftWebhook: jest.fn() };
		const silent = () => {};

		service = new LivekitWebhookService(
			...([
				{ startAutoRecordingIfNeeded: async () => {}, getAllRecordings: async () => ({ recordings: [] }) },
				{},
				{ getParticipant: async () => liveParticipant, deleteParticipant },
				{ getMeetRoomName: async () => 'Room 1' },
				{},
				webhookDispatcherService,
				{},
				{ releaseParticipantName: async () => {} },
				{},
				{},
				{ cleanupState: async () => {} },
				container.get(TokenService),
				redis,
				{ info: silent, warn: silent, debug: silent, verbose: silent, error: silent },
				{ getBroadcasts: async () => [] }
			] as unknown as ConstructorParameters<typeof LivekitWebhookService>)
		);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('removes a session that joined with the token it held before its demotion, and reports neither its join nor its departure', async () => {
		liveParticipant = session(ISSUED_BEFORE_DEMOTION);

		await service.handleParticipantJoined(ROOM, liveParticipant);
		await service.handleParticipantLeft(ROOM, liveParticipant);

		expect(deleteParticipant).toHaveBeenCalledWith(ROOM.name, IDENTITY);
		expect(webhookDispatcherService.sendParticipantJoinedWebhook).not.toHaveBeenCalled();
		expect(webhookDispatcherService.sendParticipantLeftWebhook).not.toHaveBeenCalled();
	});

	it('keeps a session whose token is current, and reports its join and its departure', async () => {
		liveParticipant = session(ISSUED_AFTER_DEMOTION);

		await service.handleParticipantJoined(ROOM, liveParticipant);
		await service.handleParticipantLeft(ROOM, liveParticipant);

		expect(deleteParticipant).not.toHaveBeenCalled();
		expect(webhookDispatcherService.sendParticipantJoinedWebhook).toHaveBeenCalledTimes(1);
		expect(webhookDispatcherService.sendParticipantLeftWebhook).toHaveBeenCalledTimes(1);
	});

	it('keeps a session the server gave current metadata after it joined', async () => {
		liveParticipant = session(ISSUED_AFTER_DEMOTION);

		await service.handleParticipantJoined(ROOM, session(ISSUED_BEFORE_DEMOTION));

		expect(deleteParticipant).not.toHaveBeenCalled();
		expect(webhookDispatcherService.sendParticipantJoinedWebhook).toHaveBeenCalledTimes(1);
	});

	it('keeps a session that joined with a revoked token when the participant has since reconnected as a new session', async () => {
		liveParticipant = { ...session(ISSUED_BEFORE_DEMOTION), sid: 'PA_2' } as ParticipantInfo;

		await service.handleParticipantJoined(ROOM, session(ISSUED_BEFORE_DEMOTION));

		expect(deleteParticipant).not.toHaveBeenCalled();
		expect(webhookDispatcherService.sendParticipantJoinedWebhook).toHaveBeenCalledTimes(1);
	});

	it('does not ask the media server about a session whose token is current', async () => {
		liveParticipant = session(ISSUED_AFTER_DEMOTION);
		const getParticipant = jest.fn(async () => liveParticipant);
		Object.assign((service as unknown as { livekitService: object }).livekitService, { getParticipant });

		await service.handleParticipantJoined(ROOM, liveParticipant);

		expect(getParticipant).not.toHaveBeenCalled();
	});

	it('leaves a session without Meet metadata alone', async () => {
		liveParticipant = session();

		await service.handleParticipantJoined(ROOM, liveParticipant);

		expect(deleteParticipant).not.toHaveBeenCalled();
		expect(container.get(RoomRepository).findByRoomId).not.toHaveBeenCalled();
		expect(webhookDispatcherService.sendParticipantJoinedWebhook).toHaveBeenCalledTimes(1);
	});
});

describe('LivekitWebhookService participant presence and meeting state', () => {
	const ROOM = {
		name: 'room-1',
		sid: 'RM_1',
		metadata: JSON.stringify({ roomOptions: { roomName: 'Room 1' } })
	} as Room;
	const recording = { recordingId: 'room-1--EG_1--uid', roomId: 'room-1' } as MeetRecordingInfo;
	const broadcasts = [{ broadcastId: 'EG_2' }, { broadcastId: 'EG_3' }];

	class AlwaysCurrentTokenService extends LivekitWebhookService {
		protected override async hasRevokedToken(): Promise<boolean> {
			return false;
		}
	}

	const participant = (overrides: Partial<ParticipantInfo> = {}) =>
		({
			identity: 'speaker-1',
			sid: 'PA_1',
			name: 'Ana',
			kind: ParticipantInfo_Kind.STANDARD,
			metadata: JSON.stringify({ userId: 'alice' }),
			...overrides
		}) as ParticipantInfo;

	const build = ({
		recordingsByStatus = {} as Partial<Record<MeetRecordingStatus, MeetRecordingInfo[]>>,
		roomBroadcasts = [] as unknown[]
	} = {}) => {
		const calls: string[] = [];
		const record =
			(name: string) =>
			async (...args: unknown[]) => {
				calls.push(
					`${name}(${args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(', ')})`
				);
			};
		const webhooks = { sendParticipantJoinedWebhook: jest.fn(), sendParticipantLeftWebhook: jest.fn() };
		const service = new AlwaysCurrentTokenService(
			...([
				{
					startAutoRecordingIfNeeded: async () => {},
					getAllRecordings: async ({ status }: { status: MeetRecordingStatus }) => ({
						recordings: recordingsByStatus[status] ?? []
					})
				},
				{},
				{},
				{ getMeetRoomName: async () => 'Room 1' },
				{},
				webhooks,
				{
					sendRecordingUpdatedSignal: async (
						roomId: string,
						info: MeetRecordingInfo | undefined,
						sid: string
					) => calls.push(`recordingSignal(${roomId}, ${info?.recordingId}, ${sid})`),
					sendBroadcastUpdatedSignal: async (roomId: string, info: { broadcastId: string }, sid: string) =>
						calls.push(`broadcastSignal(${roomId}, ${info.broadcastId}, ${sid})`)
				},
				{ releaseParticipantName: record('releaseName') },
				{ upsertUserInRoom: record('upsertPresence'), removeUserFromRoom: record('removePresence') },
				{},
				{ cleanupState: record('cleanupAi') },
				{
					parseRoomMemberTokenMetadata: (metadata: string) => {
						const parsed = JSON.parse(metadata);

						if (!parsed.userId && !parsed.anonymous) throw new Error('invalid');

						return parsed;
					}
				},
				new FakeRedisService(),
				new FakeLogger(),
				{ getBroadcasts: async () => roomBroadcasts }
			] as unknown as ConstructorParameters<typeof LivekitWebhookService>)
		);

		return { service, calls, webhooks };
	};

	it('records the presence of a signed-in user and tells them about the recording and broadcasts in progress', async () => {
		const { service, calls, webhooks } = build({
			recordingsByStatus: { [MeetRecordingStatus.ACTIVE]: [recording] },
			roomBroadcasts: broadcasts
		});

		await service.handleParticipantJoined(ROOM, participant());

		expect(webhooks.sendParticipantJoinedWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ roomId: 'room-1', roomName: 'Room 1' })
		);
		expect(calls).toEqual([
			'upsertPresence(alice, room-1, speaker-1)',
			`recordingSignal(room-1, ${recording.recordingId}, PA_1)`,
			'broadcastSignal(room-1, EG_2, PA_1)',
			'broadcastSignal(room-1, EG_3, PA_1)'
		]);
	});

	it('tells a joining participant about a recording that is still starting', async () => {
		const starting = { ...recording, recordingId: 'room-1--EG_9--uid' };
		const { service, calls } = build({ recordingsByStatus: { [MeetRecordingStatus.STARTING]: [starting] } });

		await service.handleParticipantJoined(ROOM, participant({ metadata: '' }));

		expect(calls).toEqual([`recordingSignal(room-1, ${starting.recordingId}, PA_1)`]);
	});

	it('prefers the recording that is already recording over one still starting', async () => {
		const starting = { ...recording, recordingId: 'room-1--EG_9--uid' };
		const { service, calls } = build({
			recordingsByStatus: {
				[MeetRecordingStatus.ACTIVE]: [recording],
				[MeetRecordingStatus.STARTING]: [starting]
			}
		});

		await service.handleParticipantJoined(ROOM, participant({ metadata: '' }));

		expect(calls).toEqual([`recordingSignal(room-1, ${recording.recordingId}, PA_1)`]);
	});

	it('records no presence for a participant whose metadata names no user', async () => {
		const { service, calls, webhooks } = build();

		await service.handleParticipantJoined(ROOM, participant({ metadata: JSON.stringify({ anonymous: true }) }));
		await service.handleParticipantJoined(ROOM, participant({ metadata: 'not json' }));

		expect(webhooks.sendParticipantJoinedWebhook).toHaveBeenCalledTimes(2);
		expect(calls).toEqual([]);
	});

	it('ignores the join of a participant that is not a person', async () => {
		const { service, calls, webhooks } = build({ roomBroadcasts: broadcasts });

		await service.handleParticipantJoined(ROOM, participant({ kind: ParticipantInfo_Kind.EGRESS }));

		expect(webhooks.sendParticipantJoinedWebhook).not.toHaveBeenCalled();
		expect(calls).toEqual([]);
	});

	it('reports the departure, clears the presence and releases the name of a signed-in user', async () => {
		const { service, calls, webhooks } = build();

		await service.handleParticipantLeft(ROOM, participant());

		expect(webhooks.sendParticipantLeftWebhook).toHaveBeenCalledWith(
			expect.objectContaining({ roomId: 'room-1', roomName: 'Room 1' })
		);
		expect(calls).toEqual([
			'removePresence(alice, room-1)',
			expect.stringMatching(/^releaseName\(room-1, /),
			'cleanupAi(room-1, speaker-1)'
		]);
	});

	it('clears no presence for an anonymous participant leaving', async () => {
		const { service, calls } = build();

		await service.handleParticipantLeft(ROOM, participant({ metadata: '' }));

		expect(calls).toEqual([expect.stringMatching(/^releaseName/), 'cleanupAi(room-1, speaker-1)']);
	});

	it('ignores the departure of a participant that is neither a person nor an egress', async () => {
		const { service, calls, webhooks } = build();

		await service.handleParticipantLeft(ROOM, participant({ kind: ParticipantInfo_Kind.AGENT }));

		expect(webhooks.sendParticipantLeftWebhook).not.toHaveBeenCalled();
		expect(calls).toEqual([]);
	});
});

describe('LivekitWebhookService.webhookEventBelongsToOpenViduMeet', () => {
	const meetMetadata = JSON.stringify({ createdBy: 'openviduMeet' });
	const foreignMetadata = JSON.stringify({ createdBy: 'someone-else' });

	const build = ({ liveMetadata = '', existing = [] as string[] } = {}) => {
		const service = new LivekitWebhookService(
			...([
				{},
				{},
				{ getRoomMetadata: async () => liveMetadata },
				{ meetRoomExists: async (roomId: string) => existing.includes(roomId) },
				{},
				{},
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
		return (event: object) => service.webhookEventBelongsToOpenViduMeet(event as never);
	};

	it('claims a room Meet created that still exists in Meet', async () => {
		const belongs = build({ existing: ['room-1'] });

		expect(await belongs({ room: { name: 'room-1', metadata: meetMetadata } })).toBe(true);
	});

	it('rejects a room Meet created but no longer has', async () => {
		expect(await build()({ room: { name: 'room-1', metadata: meetMetadata } })).toBe(false);
	});

	it('rejects a room someone else created, even under the name of a Meet room', async () => {
		const belongs = build({ existing: ['room-1'] });

		expect(await belongs({ room: { name: 'room-1', metadata: foreignMetadata } })).toBe(false);
	});

	it('reads the live room metadata when the event carries none', async () => {
		expect(await build({ liveMetadata: meetMetadata })({ room: { name: 'room-1', metadata: '' } })).toBe(true);
		expect(await build({ existing: ['room-1'] })({ room: { name: 'room-1', metadata: '' } })).toBe(true);
		expect(await build()({ room: { name: 'room-1', metadata: '' } })).toBe(false);
	});

	it('identifies the room of an egress or ingress event by its room name', async () => {
		expect(await build({ liveMetadata: meetMetadata })({ egressInfo: { roomName: 'room-1' } })).toBe(true);
		expect(await build({ existing: ['room-1'] })({ ingressInfo: { roomName: 'room-1' } })).toBe(true);
		expect(await build()({ egressInfo: { roomName: 'room-1' } })).toBe(false);
	});

	it('rejects an event that names no room at all', async () => {
		expect(await build({ liveMetadata: meetMetadata, existing: [''] })({ egressInfo: {} })).toBe(false);
	});
});

describe('LivekitWebhookService egress routing', () => {
	const build = () => {
		const broadcastEvents: EgressInfo[] = [];
		const created: MeetRecordingInfo[] = [];
		const signals: string[] = [];
		const startedWebhooks: MeetRecordingInfo[] = [];
		const service = new LivekitWebhookService(
			...([
				{ toRecordingInfo: async (egress: EgressInfo) => RecordingHelper.toRecordingInfo(egress, 'Room 1') },
				{ create: async (recording: MeetRecordingInfo) => created.push(recording) },
				{},
				{},
				{},
				{ sendRecordingStartedWebhook: (recording: MeetRecordingInfo) => startedWebhooks.push(recording) },
				{
					sendRecordingUpdatedSignal: async (roomId: string, recording: MeetRecordingInfo) =>
						signals.push(`${roomId}:${recording.recordingId}`)
				},
				{},
				{},
				{},
				{},
				{},
				{},
				new FakeLogger(),
				{ handleEgressEvent: async (egress: EgressInfo) => broadcastEvents.push(egress) }
			] as unknown as ConstructorParameters<typeof LivekitWebhookService>)
		);
		return { service, broadcastEvents, created, signals, startedWebhooks };
	};

	it('hands a stream egress to the broadcast and stores nothing as a recording', async () => {
		const { service, broadcastEvents, created } = build();
		const egress = new EgressInfo({ egressId: 'EG_1', roomName: 'room-1', streamResults: [{}] });

		await service.handleEgressStarted(egress);
		await service.handleEgressUpdated(egress);
		await service.handleEgressEnded(egress);

		expect(broadcastEvents).toEqual([egress, egress, egress]);
		expect(created).toEqual([]);
	});

	it('stores a started file egress as a recording, reports it and tells the room', async () => {
		const { service, broadcastEvents, created, signals, startedWebhooks } = build();
		const egress = new EgressInfo({
			egressId: 'EG_1',
			roomName: 'room-1',
			status: EgressStatus.EGRESS_STARTING,
			fileResults: [{ filename: 'room-1--uid1.mp4' }]
		});

		await service.handleEgressStarted(egress);

		expect(broadcastEvents).toEqual([]);
		expect(created).toEqual([
			expect.objectContaining({
				recordingId: 'room-1--EG_1--uid1',
				roomName: 'Room 1',
				status: MeetRecordingStatus.STARTING
			})
		]);
		expect(startedWebhooks).toEqual(created);
		expect(signals).toEqual(['room-1:room-1--EG_1--uid1']);
	});

	it('ignores an egress that writes both a file and a stream', async () => {
		const { service, broadcastEvents, created } = build();

		await service.handleEgressStarted(
			new EgressInfo({ egressId: 'EG_1', roomName: 'room-1', streamResults: [{}], fileResults: [{}] })
		);

		expect(broadcastEvents).toEqual([]);
		expect(created).toEqual([]);
	});
});

/** A webhook is LiveKit telling about something that already happened: failing to process it must not fail it. */
describe('LivekitWebhookService handlers whose collaborators fail', () => {
	const failing = () => Promise.reject(new Error('MongoDB unreachable'));
	const ROOM = { name: 'room-1', sid: 'RM_1', metadata: '' } as Room;
	const person = {
		identity: 'speaker-1',
		sid: 'PA_1',
		name: 'Ana',
		kind: ParticipantInfo_Kind.STANDARD,
		metadata: ''
	} as ParticipantInfo;

	const service = new LivekitWebhookService(
		...([
			{
				startAutoRecordingIfNeeded: async () => {},
				getAllRecordings: failing,
				reactivateAutoRecording: async () => {}
			},
			{},
			{},
			{ getMeetRoom: failing },
			{ finishMeeting: failing },
			{ sendParticipantJoinedWebhook: () => {}, sendParticipantLeftWebhook: () => {} },
			{},
			{ releaseParticipantName: failing },
			{},
			{},
			{ cleanupState: async () => {} },
			{},
			{ get: async () => null, delete: failing },
			new FakeLogger(),
			{ getBroadcasts: async () => [] }
		] as unknown as ConstructorParameters<typeof LivekitWebhookService>)
	);
	Object.assign(service, {
		getRoomScheduledTasksService: async () => new FakeRoomScheduledTasksService()
	});

	it.each([
		['a participant join', () => service.handleParticipantJoined(ROOM, person)],
		['a participant departure', () => service.handleParticipantLeft(ROOM, person)],
		['a room start', () => service.handleRoomStarted(ROOM)],
		['a room end', () => service.handleRoomFinished(ROOM)],
		[
			'a recording egress',
			() =>
				service.handleEgressUpdated(
					new EgressInfo({
						egressId: 'EG_1',
						roomName: 'room-1',
						fileResults: [{ filename: 'room-1--u.mp4' }]
					})
				)
		]
	])('resolves %s', async (_case, handle) => {
		await expect(handle()).resolves.toBeUndefined();
	});
});

describe('LivekitWebhookService.getEventFromWebhook', () => {
	const service = new LivekitWebhookService(
		...([
			{},
			{},
			{},
			{},
			{},
			{},
			{},
			{},
			{},
			{},
			{},
			{},
			{},
			new FakeLogger(),
			{}
		] as unknown as ConstructorParameters<typeof LivekitWebhookService>)
	);
	const body = JSON.stringify({ event: 'room_started', id: 'EV_1', room: { name: 'room-1' } });
	const signed = async (payload: string, secret = MEET_ENV.LIVEKIT_API_SECRET) => {
		const token = new AccessToken(MEET_ENV.LIVEKIT_API_KEY, secret);
		token.sha256 = crypto.createHash('sha256').update(payload).digest('base64');
		return token.toJwt();
	};

	it('reads an event LiveKit signed', async () => {
		const event = await service.getEventFromWebhook(body, await signed(body));

		expect(event).toMatchObject({ event: 'room_started', id: 'EV_1', room: { name: 'room-1' } });
	});

	it('refuses an event whose body is not the one signed, signed with another secret, or not signed', async () => {
		await expect(
			service.getEventFromWebhook(body.replace('room-1', 'room-2'), await signed(body))
		).rejects.toThrow();
		await expect(service.getEventFromWebhook(body, await signed(body, 'another-secret'))).rejects.toThrow();
		await expect(service.getEventFromWebhook(body)).rejects.toThrow();
	});
});
