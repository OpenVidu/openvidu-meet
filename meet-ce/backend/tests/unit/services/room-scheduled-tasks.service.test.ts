import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { Room } from 'livekit-server-sdk';
import ms from 'ms';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { MeetRoomHelper } from '../../../src/helpers/room.helper.js';
import type { IScheduledTask } from '../../../src/models/task-scheduler.model.js';
import { RoomScheduledTasksService } from '../../../src/services/room-scheduled-tasks.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

class FakeTaskSchedulerService {
	tasks = new Map<string, IScheduledTask>();
	armed: IScheduledTask[] = [];
	cancelled: string[] = [];

	registerTask(task: IScheduledTask): void {
		this.armed.push(task);
		this.tasks.set(task.name, task);
	}

	cancelTask(name: string): void {
		this.cancelled.push(name);
		this.tasks.delete(name);
	}
}

class FakeMutexService {
	acquirable = true;
	lockedKeys: string[] = [];

	async withLock<T>(key: string, _ttl: number, callback: () => Promise<T>): Promise<T | null> {
		this.lockedKeys.push(key);

		if (!this.acquirable) {
			return null;
		}

		return await callback();
	}
}

class FakeLiveKitService {
	liveRoomNames: string[] = [];
	existingRoomNames = new Set<string>();
	rooms = new Map<string, { sid: string; creationTime: number }>();
	/** 'deleted' = deleteRoom really ended it; 'already-gone' = a no-op (room was gone already); 'error' = deleteRoom throws */
	deleteOutcome: 'deleted' | 'already-gone' | 'error' = 'deleted';
	deletedRoomNames: string[] = [];
	roomsExistError: Error | null = null;
	findRoomError: Error | null = null;

	async listRooms(): Promise<Room[]> {
		return this.liveRoomNames.map((name) => ({ name, ...this.rooms.get(name) }) as unknown as Room);
	}

	async roomsExist(roomNames: string[]): Promise<Map<string, boolean>> {
		if (this.roomsExistError) {
			throw this.roomsExistError;
		}

		return new Map(roomNames.map((name) => [name, this.existingRoomNames.has(name)]));
	}

	async findRoom(roomName: string): Promise<Room | undefined> {
		if (this.findRoomError) {
			throw this.findRoomError;
		}

		const room = this.rooms.get(roomName);
		return room && ({ name: roomName, ...room } as unknown as Room);
	}

	async deleteRoom(roomName: string): Promise<boolean> {
		this.deletedRoomNames.push(roomName);

		if (this.deleteOutcome === 'error') {
			throw new Error(`boom deleting ${roomName}`);
		}

		return this.deleteOutcome === 'deleted';
	}
}

class FakeRoomRepository {
	openRoomIds = new Set<string>();
	activeRoomIds: string[] = [];
	roomsWithMaxDuration: { roomId: string; config: { maxDurationMinutes: number } }[] = [];

	async findOpenRoomIds(roomIds: string[]): Promise<string[]> {
		return roomIds.filter((roomId) => this.openRoomIds.has(roomId));
	}

	async findActiveRooms(): Promise<{ rooms: { roomId: string }[]; isTruncated: boolean; nextPageToken?: string }> {
		return { rooms: this.activeRoomIds.map((roomId) => ({ roomId })), isTruncated: false };
	}

	async findActiveRoomsWithMaxDuration(): Promise<{
		rooms: { roomId: string; config: { maxDurationMinutes: number } }[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		return { rooms: this.roomsWithMaxDuration, isTruncated: false };
	}
}

class FakeLivekitWebhookService {
	reconciledRooms: Room[] = [];
	cleanedUpRoomIds: string[] = [];
	failFor = new Set<string>();

	get reconciledRoomIds(): string[] {
		return this.reconciledRooms.map(({ name }) => name);
	}

	async handleRoomStarted(room: Room): Promise<void> {
		if (this.failFor.has(room.name)) {
			throw new Error(`boom for ${room.name}`);
		}

		this.reconciledRooms.push(room);
	}

	async handleRoomFinished({ name }: Room): Promise<void> {
		this.cleanedUpRoomIds.push(name);
	}
}

class FakeRedisService {
	store = new Map<string, string>();

	async get(key: string): Promise<string | null> {
		return this.store.get(key) ?? null;
	}

	async set(key: string, value: string): Promise<string> {
		this.store.set(key, value);
		return 'OK';
	}

	delete(keys: string | string[]): Promise<number> {
		const list = typeof keys === 'string' ? [keys] : keys;
		const deleted = list.filter((key) => this.store.delete(key)).length;
		return Promise.resolve(deleted);
	}
}

class TestableRoomScheduledTasksService extends RoomScheduledTasksService {
	runReconcileOpenRoomsGC(): Promise<void> {
		return this.reconcileOpenRoomsGC();
	}

	runReconcileActiveMeetingsGoneFromLiveKit(): Promise<void> {
		return this.reconcileActiveMeetingsGoneFromLiveKit();
	}

	runValidateRoomsStatusGC(): Promise<void> {
		return this.validateRoomsStatusGC();
	}

	runMarkMeetingEndedByDurationLimit(roomId: string, meetingId: string): Promise<void> {
		return this.markMeetingEndedByDurationLimit(roomId, meetingId);
	}

	runEnforceMeetingMaxDurationGC(): Promise<void> {
		return this.enforceMeetingMaxDurationGC();
	}

	runClearMeetingEndedCause(roomId: string, meetingId: string): Promise<void> {
		return this.clearMeetingEndedCause(roomId, meetingId);
	}
}

const buildService = (
	livekitService: FakeLiveKitService,
	roomRepository: FakeRoomRepository,
	redisService: FakeRedisService = new FakeRedisService()
) => {
	const livekitWebhookService = new FakeLivekitWebhookService();
	const taskScheduler = new FakeTaskSchedulerService();
	const mutexService = new FakeMutexService();
	const service = new TestableRoomScheduledTasksService(
		...([
			noopLogger,
			roomRepository,
			{},
			taskScheduler,
			livekitService,
			livekitWebhookService,
			{},
			redisService,
			mutexService
		] as unknown as ConstructorParameters<typeof RoomScheduledTasksService>)
	);
	return { service, livekitWebhookService, taskScheduler, mutexService };
};

describe('RoomScheduledTasksService.reconcileOpenRoomsGC (C2: lost room_started self-heal)', () => {
	it('does nothing when LiveKit has no active rooms', async () => {
		const { service, livekitWebhookService } = buildService(new FakeLiveKitService(), new FakeRoomRepository());

		await service.runReconcileOpenRoomsGC();

		expect(livekitWebhookService.reconciledRoomIds).toEqual([]);
	});

	it('does nothing when every LiveKit-active room is already reflected as active in DB', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.liveRoomNames = ['room-a', 'room-b'];
		const { service, livekitWebhookService } = buildService(livekitService, new FakeRoomRepository());

		await service.runReconcileOpenRoomsGC();

		expect(livekitWebhookService.reconciledRoomIds).toEqual([]);
	});

	it('reconciles only the rooms that are live in LiveKit but still open in DB', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.liveRoomNames = ['room-active', 'room-open', 'room-gone-from-db'];
		const roomRepository = new FakeRoomRepository();
		roomRepository.openRoomIds = new Set(['room-open', 'room-gone-from-db']);
		const { service, livekitWebhookService } = buildService(livekitService, roomRepository);

		await service.runReconcileOpenRoomsGC();

		expect(livekitWebhookService.reconciledRoomIds.sort()).toEqual(['room-gone-from-db', 'room-open']);
	});

	it('hands over the live LiveKit room, whose creation time is what the duration timer needs', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.liveRoomNames = ['room-open'];
		livekitService.rooms.set('room-open', { sid: 'sid-open', creationTime: 1_700_000_000 });
		const roomRepository = new FakeRoomRepository();
		roomRepository.openRoomIds = new Set(['room-open']);
		const { service, livekitWebhookService } = buildService(livekitService, roomRepository);

		await service.runReconcileOpenRoomsGC();

		expect(livekitWebhookService.reconciledRooms).toEqual([
			{ name: 'room-open', sid: 'sid-open', creationTime: 1_700_000_000 }
		]);
	});

	it('keeps reconciling the other rooms when one fails', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.liveRoomNames = ['room-fails', 'room-succeeds'];
		const roomRepository = new FakeRoomRepository();
		roomRepository.openRoomIds = new Set(['room-fails', 'room-succeeds']);
		const { service, livekitWebhookService } = buildService(livekitService, roomRepository);
		livekitWebhookService.failFor.add('room-fails');

		await expect(service.runReconcileOpenRoomsGC()).resolves.toBeUndefined();

		expect(livekitWebhookService.reconciledRoomIds).toEqual(['room-succeeds']);
	});
});

/**
 * G1 (MEET-BRANCH-AUDIT-FINDINGS.md): a LiveKit API failure must read as "existence unknown", never
 * as "these rooms are gone". `LiveKitService.roomsExist` now rethrows instead of defaulting every
 * room to `false`, so a network blip or a LiveKit restart during this sweep can no longer be
 * mistaken for every active room having ended (which would fire spurious `meetingEnded` webhooks and,
 * for `meetingEndAction=DELETE` rooms, delete recordings for meetings that are still running).
 */
describe('RoomScheduledTasksService.reconcileActiveMeetingsGoneFromLiveKit (G1: LiveKit outage must not read as "rooms gone")', () => {
	it('aborts the batch and touches no room when roomsExist fails, instead of treating the failure as "all gone"', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.roomsExistError = new Error('LiveKit down');
		const roomRepository = new FakeRoomRepository();
		roomRepository.activeRoomIds = ['room-a', 'room-b'];
		const { service, livekitWebhookService } = buildService(livekitService, roomRepository);

		await expect(service.runReconcileActiveMeetingsGoneFromLiveKit()).resolves.toBeUndefined();

		expect(livekitWebhookService.cleanedUpRoomIds).toEqual([]);
	});
});

describe('RoomScheduledTasksService.validateRoomsStatusGC (orchestrates both reconciliation directions)', () => {
	it('runs the open-room reconciliation even when the active-room direction finds nothing to do', async () => {
		// The active direction's own early return ("no active rooms found") must not prevent the
		// open direction from running afterward — that early return is exactly why the two
		// directions are separate calls instead of one intertwined function body.
		const livekitService = new FakeLiveKitService();
		livekitService.liveRoomNames = ['room-open'];
		const roomRepository = new FakeRoomRepository();
		roomRepository.activeRoomIds = [];
		roomRepository.openRoomIds = new Set(['room-open']);
		const { service, livekitWebhookService } = buildService(livekitService, roomRepository);

		await service.runValidateRoomsStatusGC();

		expect(livekitWebhookService.reconciledRoomIds).toEqual(['room-open']);
	});

	it('runs both directions and reconciles each in its own way', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.liveRoomNames = ['room-open'];
		livekitService.existingRoomNames = new Set(); // 'room-gone' no longer exists in LiveKit
		const roomRepository = new FakeRoomRepository();
		roomRepository.activeRoomIds = ['room-gone'];
		roomRepository.openRoomIds = new Set(['room-open']);
		const { service, livekitWebhookService } = buildService(livekitService, roomRepository);

		await service.runValidateRoomsStatusGC();

		expect(livekitWebhookService.cleanedUpRoomIds).toEqual(['room-gone']);
		expect(livekitWebhookService.reconciledRoomIds).toEqual(['room-open']);
	});
});

/**
 * C7 (MEET-BRANCH-AUDIT-FINDINGS.md): the write side of the MEETING_ENDED_CAUSE flag
 * LivekitWebhookService.getMeetingEndedCause reads on room_finished, scoped to the meeting sid the
 * same way MEETING_DURATION_WARNING_SENT already is.
 *//**
 * D1 (MEET-MEETING-DURATION-PRECISION-PLAN.md): the duration limit is enforced by a timer armed
 * for the meeting's own deadline, not by the sweep's tick, so a meeting no longer overruns its
 * limit by up to the sweep interval. The timer lives on the replica that armed it and is
 * replica-locally cancelled on `room_finished`, so firing it re-reads the live LiveKit room: a
 * timer that outlived its meeting must never end a later meeting in the same room.
 */

describe('RoomScheduledTasksService.markMeetingEndedByDurationLimit (C7: force-end attribution)', () => {
	it('stores the flag under the meeting sid so a later read for the same meeting matches', async () => {
		const redisService = new FakeRedisService();
		const { service } = buildService(new FakeLiveKitService(), new FakeRoomRepository(), redisService);

		await service.runMarkMeetingEndedByDurationLimit('room-1', 'sid-N');

		expect(redisService.store.get('ov_meet:meeting_ended_cause:room-1')).toBe('sid-N');
	});

	it('scopes the flag per room, not globally', async () => {
		const redisService = new FakeRedisService();
		const { service } = buildService(new FakeLiveKitService(), new FakeRoomRepository(), redisService);

		await service.runMarkMeetingEndedByDurationLimit('room-1', 'sid-N');
		await service.runMarkMeetingEndedByDurationLimit('room-2', 'sid-M');

		expect(redisService.store.get('ov_meet:meeting_ended_cause:room-1')).toBe('sid-N');
		expect(redisService.store.get('ov_meet:meeting_ended_cause:room-2')).toBe('sid-M');
	});
});

/**
 * C7 follow-up: `enforceMeetingMaxDurationGC` writes the MEETING_ENDED_CAUSE flag *before* calling
 * `deleteRoom`, deliberately, so the flag is visible to `room_finished` no matter how fast that
 * webhook arrives (see the doc comment above the write). But `deleteRoom` treats "room already
 * gone" as a benign no-op, not an error — so if a moderator's own `endMeeting` deletes the room in
 * the narrow window between the flag write and this GC's own `deleteRoom` call (or if the GC's
 * delete fails outright, e.g. a transient LiveKit error), the flag is left behind even though this
 * GC attempt is *not* what actually ended the meeting. Since the flag is scoped by the meeting's
 * sid — not cleared until it expires (24h TTL) — it then misattributes whatever *later, unrelated*
 * event actually closes that same still-running meeting (a moderator ending it minutes or hours
 * afterward, or the room emptying out) to the duration limit. `getMeetingEndedCause`
 * (livekit-webhook.service.test.ts) already proves the read side trusts the flag unconditionally;
 * these tests pin the write side's obligation to withdraw it when its own deletion didn't happen.
 */

describe('RoomScheduledTasksService.enforceMeetingMaxDurationGC (C7 follow-up: stale cause flag after a delete that was not this GC)', () => {
	const roomId = 'room-race';
	const sid = 'sid-race';
	const causeKey = `ov_meet:meeting_ended_cause:${roomId}`;

	const buildExpiredRoom = (livekitService: FakeLiveKitService, roomRepository: FakeRoomRepository) => {
		const maxDurationMinutes = 10;
		// Comfortably past the deadline — no reliance on exact timing during the test run.
		const creationTime = Math.floor(Date.now() / 1000) - (maxDurationMinutes * 60 + 120);
		livekitService.rooms.set(roomId, { sid, creationTime });
		roomRepository.roomsWithMaxDuration = [{ roomId, config: { maxDurationMinutes } }];
	};

	it('withdraws the cause flag when its own deleteRoom finds the room already gone (a moderator won the race)', async () => {
		const livekitService = new FakeLiveKitService();
		const roomRepository = new FakeRoomRepository();
		buildExpiredRoom(livekitService, roomRepository);
		livekitService.deleteOutcome = 'already-gone';
		const redisService = new FakeRedisService();
		const { service } = buildService(livekitService, roomRepository, redisService);

		await service.runEnforceMeetingMaxDurationGC();

		expect(redisService.store.get(causeKey)).toBeUndefined();
	});

	it('withdraws the cause flag when its own deleteRoom fails outright', async () => {
		const livekitService = new FakeLiveKitService();
		const roomRepository = new FakeRoomRepository();
		buildExpiredRoom(livekitService, roomRepository);
		livekitService.deleteOutcome = 'error';
		const redisService = new FakeRedisService();
		const { service } = buildService(livekitService, roomRepository, redisService);

		await expect(service.runEnforceMeetingMaxDurationGC()).resolves.toBeUndefined();

		expect(redisService.store.get(causeKey)).toBeUndefined();
	});

	it('keeps the cause flag when its own deleteRoom actually ends the meeting', async () => {
		const livekitService = new FakeLiveKitService();
		const roomRepository = new FakeRoomRepository();
		buildExpiredRoom(livekitService, roomRepository);
		livekitService.deleteOutcome = 'deleted';
		const redisService = new FakeRedisService();
		const { service } = buildService(livekitService, roomRepository, redisService);

		await service.runEnforceMeetingMaxDurationGC();

		expect(redisService.store.get(causeKey)).toBe(sid);
	});
});

describe('RoomScheduledTasksService.clearMeetingEndedCause (C7 follow-up: withdrawal is sid-scoped)', () => {
	it('deletes the flag when it still matches the given meeting', async () => {
		const redisService = new FakeRedisService();
		const { service } = buildService(new FakeLiveKitService(), new FakeRoomRepository(), redisService);
		await service.runMarkMeetingEndedByDurationLimit('room-1', 'sid-N');

		await service.runClearMeetingEndedCause('room-1', 'sid-N');

		expect(redisService.store.has('ov_meet:meeting_ended_cause:room-1')).toBe(false);
	});

	it('leaves a flag belonging to a different meeting untouched', async () => {
		const redisService = new FakeRedisService();
		const { service } = buildService(new FakeLiveKitService(), new FakeRoomRepository(), redisService);
		// A legitimate flag for a different (e.g. later) meeting already occupies the room-scoped key.
		await service.runMarkMeetingEndedByDurationLimit('room-1', 'sid-unrelated');

		await service.runClearMeetingEndedCause('room-1', 'sid-N');

		expect(redisService.store.get('ov_meet:meeting_ended_cause:room-1')).toBe('sid-unrelated');
	});

	it('is a no-op when no flag was ever set', async () => {
		const redisService = new FakeRedisService();
		const { service } = buildService(new FakeLiveKitService(), new FakeRoomRepository(), redisService);

		await expect(service.runClearMeetingEndedCause('room-1', 'sid-N')).resolves.toBeUndefined();
	});
});

describe('RoomScheduledTasksService duration-limit timers', () => {
	const roomId = 'room-timer';
	const maxDurationMinutes = 10;
	const taskName = MeetRoomHelper.meetingMaxDurationTaskName(roomId);
	const retryDelayMs = ms(INTERNAL_CONFIG.MEETING_DURATION_END_RETRY_DELAY);
	const causeKey = `ov_meet:meeting_ended_cause:${roomId}`;
	// The armed delay is a difference between two clock readings, so the clock is pinned instead of
	// asserting a tolerance band wide enough to absorb the jitter between them.
	const nowMs = Date.UTC(2026, 8, 3, 12, 0, 0);
	const nowSeconds = () => nowMs / 1000;

	beforeAll(() => {
		jest.spyOn(Date, 'now').mockReturnValue(nowMs);
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	const startedRoom = (creationTimeSeconds: number, sid = 'sid-timer', metadata?: string) =>
		({ name: roomId, sid, creationTime: creationTimeSeconds, metadata }) as unknown as Room;

	const armedTask = (taskScheduler: FakeTaskSchedulerService): IScheduledTask => {
		const task = taskScheduler.tasks.get(taskName);

		if (!task) {
			throw new Error(`no task armed under '${taskName}'`);
		}

		return task;
	};

	const armCount = (taskScheduler: FakeTaskSchedulerService): number =>
		taskScheduler.armed.filter(({ name }) => name === taskName).length;

	it('arms a one-shot task for the time left until the meeting reaches its limit', () => {
		const { service, taskScheduler } = buildService(new FakeLiveKitService(), new FakeRoomRepository());

		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds() - 60), maxDurationMinutes);

		const task = armedTask(taskScheduler);
		expect(task.type).toBe('timeout');
		expect(ms(task.scheduleOrDelay)).toBe(9 * 60_000);
	});

	it('arms for the deadline the meeting carries, not for the limit counted from the creation time', () => {
		const { service, taskScheduler } = buildService(new FakeLiveKitService(), new FakeRoomRepository());
		const metadata = JSON.stringify({ createdBy: 'openvidu-meet', endDate: nowMs + 2 * 60_000 });

		service.scheduleMeetingMaxDurationEnd(
			startedRoom(nowSeconds() - 60, 'sid-timer', metadata),
			maxDurationMinutes
		);

		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(2 * 60_000);
	});

	it('arms an immediate task for a meeting that is already past its limit', () => {
		const { service, taskScheduler } = buildService(new FakeLiveKitService(), new FakeRoomRepository());

		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds() - maxDurationMinutes * 60 - 120), 10);

		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(0);
	});

	it('replaces the timer left armed for an earlier meeting in the same room', () => {
		const { service, taskScheduler } = buildService(new FakeLiveKitService(), new FakeRoomRepository());

		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds() - 9 * 60), maxDurationMinutes);
		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds()), maxDurationMinutes);

		expect(taskScheduler.cancelled).toEqual([taskName, taskName]);
		// The surviving timer is the second meeting's, a full limit ahead, not the first's last minute
		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(maxDurationMinutes * 60_000);
	});

	it('re-arms the timer of a meeting still running, so a replica that came up mid-meeting has one', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime: nowSeconds() - 60 });
		const roomRepository = new FakeRoomRepository();
		roomRepository.roomsWithMaxDuration = [{ roomId, config: { maxDurationMinutes } }];
		const { service, taskScheduler } = buildService(livekitService, roomRepository);

		await service.runEnforceMeetingMaxDurationGC();

		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(9 * 60_000);
		expect(livekitService.deletedRoomNames).toEqual([]);
	});

	it('cancels the timer by the same name it was armed under', () => {
		const { service, taskScheduler } = buildService(new FakeLiveKitService(), new FakeRoomRepository());
		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds()), maxDurationMinutes);

		service.cancelMeetingMaxDurationEnd(roomId);

		expect(taskScheduler.tasks.has(taskName)).toBe(false);
	});

	it('ends the meeting, attributed to the duration limit, when the timer fires', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime: nowSeconds() - maxDurationMinutes * 60 });
		const redisService = new FakeRedisService();
		const { service, taskScheduler, mutexService } = buildService(
			livekitService,
			new FakeRoomRepository(),
			redisService
		);
		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds() - maxDurationMinutes * 60), maxDurationMinutes);

		await armedTask(taskScheduler).callback();

		expect(livekitService.deletedRoomNames).toEqual([roomId]);
		expect(redisService.store.get(causeKey)).toBe('sid-timer');
		expect(mutexService.lockedKeys).toEqual([`ov_meet_lock:meeting_duration_end_${roomId}`]);
		expect(armCount(taskScheduler)).toBe(1);
	});

	it('leaves a later meeting in the same room alone when a stale timer fires', async () => {
		const livekitService = new FakeLiveKitService();
		const redisService = new FakeRedisService();
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository(), redisService);
		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds() - maxDurationMinutes * 60), maxDurationMinutes);
		// The meeting the timer was armed for is over and another one is running in the same room,
		// long enough to be past the limit the stale timer carries but not past its own.
		livekitService.rooms.set(roomId, {
			sid: 'sid-later',
			creationTime: nowSeconds() - maxDurationMinutes * 60 - 60
		});

		await armedTask(taskScheduler).callback();

		expect(livekitService.deletedRoomNames).toEqual([]);
		expect(redisService.store.has(causeKey)).toBe(false);
		expect(armCount(taskScheduler)).toBe(1);
	});

	it('is a no-op when the meeting is already gone', async () => {
		const livekitService = new FakeLiveKitService();
		const redisService = new FakeRedisService();
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository(), redisService);
		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds() - maxDurationMinutes * 60), maxDurationMinutes);

		await expect(armedTask(taskScheduler).callback()).resolves.toBeUndefined();

		expect(livekitService.deletedRoomNames).toEqual([]);
		expect(redisService.store.has(causeKey)).toBe(false);
		expect(armCount(taskScheduler)).toBe(1);
	});

	it('retries instead of handing the meeting to the sweep when another replica holds the room lock', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime: nowSeconds() - maxDurationMinutes * 60 });
		const redisService = new FakeRedisService();
		const { service, taskScheduler, mutexService } = buildService(
			livekitService,
			new FakeRoomRepository(),
			redisService
		);
		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds() - maxDurationMinutes * 60), maxDurationMinutes);
		mutexService.acquirable = false;

		await armedTask(taskScheduler).callback();

		expect(livekitService.deletedRoomNames).toEqual([]);
		expect(redisService.store.has(causeKey)).toBe(false);
		expect(armCount(taskScheduler)).toBe(2);
		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(retryDelayMs);
	});

	it('retries when its own deleteRoom fails, rather than spending its one shot', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime: nowSeconds() - maxDurationMinutes * 60 });
		livekitService.deleteOutcome = 'error';
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository());
		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds() - maxDurationMinutes * 60), maxDurationMinutes);

		await armedTask(taskScheduler).callback();

		expect(armCount(taskScheduler)).toBe(2);
		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(retryDelayMs);
	});

	it('retries when the LiveKit read throws, so an outage does not demote the meeting to the sweep', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime: nowSeconds() - maxDurationMinutes * 60 });
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository());
		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds() - maxDurationMinutes * 60), maxDurationMinutes);
		livekitService.findRoomError = new Error('livekit unreachable');

		await expect(armedTask(taskScheduler).callback()).resolves.toBeUndefined();

		expect(livekitService.deletedRoomNames).toEqual([]);
		expect(armCount(taskScheduler)).toBe(2);
		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(retryDelayMs);
	});

	it('backs off per failed attempt and stops retrying once the sweep is the faster owner', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime: nowSeconds() - maxDurationMinutes * 60 });
		livekitService.deleteOutcome = 'error';
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository());
		service.scheduleMeetingMaxDurationEnd(startedRoom(nowSeconds() - maxDurationMinutes * 60), maxDurationMinutes);

		for (let fire = 0; fire < 6; fire++) {
			await armedTask(taskScheduler).callback();
		}

		const armedDelays = taskScheduler.armed
			.filter(({ name }) => name === taskName)
			.map(({ scheduleOrDelay }) => ms(scheduleOrDelay));
		// The first delay is the arm itself, already past the limit; the rest are the retries.
		expect(armedDelays).toEqual([0, retryDelayMs, retryDelayMs * 2, retryDelayMs * 4, retryDelayMs * 8]);
		expect(retryDelayMs * 16).toBeGreaterThan(ms(INTERNAL_CONFIG.MEETING_MAX_DURATION_GC_INTERVAL));
	});

	it('ends the meeting when it fires a hair early, instead of arming a timer for a millisecond', async () => {
		// A millisecond short of its deadline, which is what a timer counting down on the monotonic
		// clock can read back off a wall clock that moved under it.
		const creationTime = (nowMs - maxDurationMinutes * 60_000 + 1) / 1000;
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime });
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository());
		service.scheduleMeetingMaxDurationEnd(startedRoom(creationTime), maxDurationMinutes);

		await armedTask(taskScheduler).callback();

		expect(livekitService.deletedRoomNames).toEqual([roomId]);
		expect(armCount(taskScheduler)).toBe(1);
	});

	it('re-arms for what is left when it fires further from the deadline than the tolerance', async () => {
		const remainingMs = ms(INTERNAL_CONFIG.MEETING_DURATION_END_TOLERANCE) + 1;
		const creationTime = (nowMs - maxDurationMinutes * 60_000 + remainingMs) / 1000;
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime });
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository());
		service.scheduleMeetingMaxDurationEnd(startedRoom(creationTime), maxDurationMinutes);

		await armedTask(taskScheduler).callback();

		expect(livekitService.deletedRoomNames).toEqual([]);
		expect(armCount(taskScheduler)).toBe(2);
		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(remainingMs);
	});
});
