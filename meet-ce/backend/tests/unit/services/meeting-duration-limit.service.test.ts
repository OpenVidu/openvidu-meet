import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetEventOrigin, MeetMeetingEndedReason } from '@openvidu-meet/typings';
import type { Room } from 'livekit-server-sdk';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { MeetRoomHelper } from '../../../src/helpers/room.helper.js';
import type { IScheduledTask } from '../../../src/models/task-scheduler.model.js';
import { MeetingDurationLimitService } from '../../../src/services/meeting-duration-limit.service.js';

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
	onLockAcquired: () => void = () => {};

	async withLock<T>(key: string, _ttl: number, callback: () => Promise<T>): Promise<T | null> {
		this.lockedKeys.push(key);

		if (!this.acquirable) {
			return null;
		}

		this.onLockAcquired();
		return await callback();
	}
}

class FakeLiveKitService {
	rooms = new Map<string, { sid: string; creationTime: number }>();
	/** 'deleted' = deleteRoom really ended it; 'already-gone' = a no-op (room was gone already); 'error' = deleteRoom throws */
	deleteOutcome: 'deleted' | 'already-gone' | 'error' = 'deleted';
	deletedRoomNames: string[] = [];
	findRoomError: Error | null = null;

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
	roomsWithMaxDuration: { roomId: string; config: { maxDurationMinutes: number } }[] = [];

	async findActiveRoomsWithMaxDuration(): Promise<{
		rooms: { roomId: string; config: { maxDurationMinutes: number } }[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		return { rooms: this.roomsWithMaxDuration, isTruncated: false };
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

class TestableMeetingDurationLimitService extends MeetingDurationLimitService {
	runRecordMeetingEndedReason(roomId: string, meetingId: string): Promise<void> {
		return this.recordMeetingEndedReason(roomId, meetingId);
	}

	runDurationLimitTimersGC(): Promise<void> {
		return this.reconcileDurationLimitTimersGC();
	}

	runRetryDurationLimitTimer(armedMeeting: Room, maxDurationMinutes: number, retryDelayMs: number): void {
		this.retryDurationLimitTimer(armedMeeting, maxDurationMinutes, retryDelayMs);
	}

	runClearMeetingEndedReason(roomId: string, meetingId: string): Promise<void> {
		return this.clearMeetingEndedReason(roomId, meetingId);
	}
}

const buildService = (
	livekitService: FakeLiveKitService = new FakeLiveKitService(),
	roomRepository: FakeRoomRepository = new FakeRoomRepository(),
	redisService: FakeRedisService = new FakeRedisService()
) => {
	const taskScheduler = new FakeTaskSchedulerService();
	const mutexService = new FakeMutexService();
	const endedWaits: string[] = [];
	const waitingRoomService = {
		endMeeting: async (roomId: string, origin: MeetEventOrigin) => {
			endedWaits.push(`${roomId}:${origin}`);
		}
	};
	const service = new TestableMeetingDurationLimitService(
		...([
			noopLogger,
			roomRepository,
			taskScheduler,
			livekitService,
			redisService,
			mutexService,
			waitingRoomService
		] as unknown as ConstructorParameters<typeof MeetingDurationLimitService>)
	);
	return { service, taskScheduler, mutexService, endedWaits };
};

describe('MeetingDurationLimitService (the sweep it installs on construction)', () => {
	it('schedules the duration-limit sweep', () => {
		const { taskScheduler } = buildService();

		expect(taskScheduler.armed.map(({ name, type }) => ({ name, type }))).toEqual([
			{ name: 'reconcileDurationLimitTimersGC', type: 'cron' }
		]);
	});
});

/**
 * Reads the MEETING_ENDED_REASON flag stamped before force-ending a meeting for exceeding its
 * duration limit, deciding whether the meetingEnded webhook carries an attributed reason instead of
 * reading as a moderator's own end.
 */
describe('MeetingDurationLimitService.getMeetingEndedReason (force-end attribution flag)', () => {
	it('is undefined when no flag was ever set (a normal end)', async () => {
		const { service } = buildService(undefined, undefined, new FakeRedisService());

		await expect(service.getMeetingEndedReason('room-1', 'sid-N')).resolves.toBeUndefined();
	});

	it('is MAX_DURATION_REACHED when the flag matches the finishing meeting', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-N');
		const { service } = buildService(undefined, undefined, redis);

		await expect(service.getMeetingEndedReason('room-1', 'sid-N')).resolves.toBe(
			MeetMeetingEndedReason.MAX_DURATION_REACHED
		);
	});

	it('is undefined when the flag belongs to a different (stale) meeting in the same room', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-OLD');
		const { service } = buildService(undefined, undefined, redis);

		await expect(service.getMeetingEndedReason('room-1', 'sid-NEW')).resolves.toBeUndefined();
	});

	it('consumes the flag, so it can only ever attribute one end', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-N');
		const { service } = buildService(undefined, undefined, redis);

		await expect(service.getMeetingEndedReason('room-1', 'sid-N')).resolves.toBe(
			MeetMeetingEndedReason.MAX_DURATION_REACHED
		);
		expect(redis.store.has('ov_meet:meeting_ended_reason:room-1')).toBe(false);
	});

	it('leaves a flag it did not attribute standing, for the end it belongs to', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-OLD');
		const { service } = buildService(undefined, undefined, redis);

		await service.getMeetingEndedReason('room-1', 'sid-NEW');

		expect(redis.store.get('ov_meet:meeting_ended_reason:room-1')).toBe('sid-OLD');
	});

	// The reconcile GC reports an end it found by noticing the room is gone from LiveKit, which is
	// also why it cannot name the meeting: there is no sid left to compare the flag against.
	it('attributes a standing flag to a caller that cannot name the finishing meeting', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_reason:room-1', 'sid-N');
		const { service } = buildService(undefined, undefined, redis);

		await expect(service.getMeetingEndedReason('room-1')).resolves.toBe(
			MeetMeetingEndedReason.MAX_DURATION_REACHED
		);
	});

	it('reports no reason to that caller when no flag stands', async () => {
		const { service } = buildService(undefined, undefined, new FakeRedisService());

		await expect(service.getMeetingEndedReason('room-1')).resolves.toBeUndefined();
	});
});

/**
 * C7 (MEET-BRANCH-AUDIT-FINDINGS.md): the write side of the MEETING_ENDED_REASON flag
 * getMeetingEndedReason reads on room_finished, scoped to the meeting sid so a leaked flag is inert
 * for the room's later meetings.
 *//**
 * D1 (MEET-MEETING-DURATION-PRECISION-PLAN.md): the duration limit is enforced by a timer armed
 * for the meeting's own deadline, not by the sweep's tick, so a meeting no longer overruns its
 * limit by up to the sweep interval. The timer lives on the replica that armed it and is
 * replica-locally cancelled on `room_finished`, so firing it re-reads the live LiveKit room: a
 * timer that outlived its meeting must never end a later meeting in the same room.
 */

describe('MeetingDurationLimitService.recordMeetingEndedReason (C7: force-end attribution)', () => {
	it('stores the flag under the meeting sid so a later read for the same meeting matches', async () => {
		const redisService = new FakeRedisService();
		const { service } = buildService(new FakeLiveKitService(), new FakeRoomRepository(), redisService);

		await service.runRecordMeetingEndedReason('room-1', 'sid-N');

		expect(redisService.store.get('ov_meet:meeting_ended_reason:room-1')).toBe('sid-N');
	});

	it('scopes the flag per room, not globally', async () => {
		const redisService = new FakeRedisService();
		const { service } = buildService(new FakeLiveKitService(), new FakeRoomRepository(), redisService);

		await service.runRecordMeetingEndedReason('room-1', 'sid-N');
		await service.runRecordMeetingEndedReason('room-2', 'sid-M');

		expect(redisService.store.get('ov_meet:meeting_ended_reason:room-1')).toBe('sid-N');
		expect(redisService.store.get('ov_meet:meeting_ended_reason:room-2')).toBe('sid-M');
	});
});

/**
 * C7 follow-up: `reconcileDurationLimitTimersGC` writes the MEETING_ENDED_REASON flag *before* calling
 * `deleteRoom`, deliberately, so the flag is visible to `room_finished` no matter how fast that
 * webhook arrives (see the doc comment above the write). But `deleteRoom` treats "room already
 * gone" as a benign no-op, not an error — so if a moderator's own `endMeeting` deletes the room in
 * the narrow window between the flag write and this GC's own `deleteRoom` call (or if the GC's
 * delete fails outright, e.g. a transient LiveKit error), the flag is left behind even though this
 * GC attempt is *not* what actually ended the meeting. Since the flag is scoped by the meeting's
 * sid — not cleared until it expires (24h TTL) — it then misattributes whatever *later, unrelated*
 * event actually closes that same still-running meeting (a moderator ending it minutes or hours
 * afterward, or the room emptying out) to the duration limit. `getMeetingEndedReason` (above)
 * already proves the read side trusts the flag unconditionally;
 * these tests pin the write side's obligation to withdraw it when its own deletion didn't happen.
 */

describe('MeetingDurationLimitService.reconcileDurationLimitTimersGC (C7 follow-up: stale reason flag after a delete that was not this GC)', () => {
	const roomId = 'room-race';
	const sid = 'sid-race';
	const reasonKey = `ov_meet:meeting_ended_reason:${roomId}`;

	const buildExpiredRoom = (livekitService: FakeLiveKitService, roomRepository: FakeRoomRepository) => {
		const maxDurationMinutes = 10;
		// Comfortably past the deadline — no reliance on exact timing during the test run.
		const creationTime = Math.floor(Date.now() / 1000) - (maxDurationMinutes * 60 + 120);
		livekitService.rooms.set(roomId, { sid, creationTime });
		roomRepository.roomsWithMaxDuration = [{ roomId, config: { maxDurationMinutes } }];
	};

	it('withdraws the reason flag when its own deleteRoom finds the room already gone (a moderator won the race)', async () => {
		const livekitService = new FakeLiveKitService();
		const roomRepository = new FakeRoomRepository();
		buildExpiredRoom(livekitService, roomRepository);
		livekitService.deleteOutcome = 'already-gone';
		const redisService = new FakeRedisService();
		const { service, endedWaits } = buildService(livekitService, roomRepository, redisService);

		await service.runDurationLimitTimersGC();

		expect(redisService.store.get(reasonKey)).toBeUndefined();
		expect(endedWaits).toEqual([]);
	});

	it('withdraws the reason flag when its own deleteRoom fails outright', async () => {
		const livekitService = new FakeLiveKitService();
		const roomRepository = new FakeRoomRepository();
		buildExpiredRoom(livekitService, roomRepository);
		livekitService.deleteOutcome = 'error';
		const redisService = new FakeRedisService();
		const { service, endedWaits } = buildService(livekitService, roomRepository, redisService);

		await expect(service.runDurationLimitTimersGC()).resolves.toBeUndefined();

		expect(redisService.store.get(reasonKey)).toBeUndefined();
		expect(endedWaits).toEqual([]);
	});

	it('keeps the reason flag when its own deleteRoom actually ends the meeting', async () => {
		const livekitService = new FakeLiveKitService();
		const roomRepository = new FakeRoomRepository();
		buildExpiredRoom(livekitService, roomRepository);
		livekitService.deleteOutcome = 'deleted';
		const redisService = new FakeRedisService();
		const { service, endedWaits } = buildService(livekitService, roomRepository, redisService);

		await service.runDurationLimitTimersGC();

		expect(redisService.store.get(reasonKey)).toBe(sid);
		expect(endedWaits).toEqual([`${roomId}:${MeetEventOrigin.SYSTEM}`]);
	});
});

describe('MeetingDurationLimitService.clearMeetingEndedReason (C7 follow-up: withdrawal is sid-scoped)', () => {
	it('deletes the flag when it still matches the given meeting', async () => {
		const redisService = new FakeRedisService();
		const { service } = buildService(new FakeLiveKitService(), new FakeRoomRepository(), redisService);
		await service.runRecordMeetingEndedReason('room-1', 'sid-N');

		await service.runClearMeetingEndedReason('room-1', 'sid-N');

		expect(redisService.store.has('ov_meet:meeting_ended_reason:room-1')).toBe(false);
	});

	it('leaves a flag belonging to a different meeting untouched', async () => {
		const redisService = new FakeRedisService();
		const { service } = buildService(new FakeLiveKitService(), new FakeRoomRepository(), redisService);
		// A legitimate flag for a different (e.g. later) meeting already occupies the room-scoped key.
		await service.runRecordMeetingEndedReason('room-1', 'sid-unrelated');

		await service.runClearMeetingEndedReason('room-1', 'sid-N');

		expect(redisService.store.get('ov_meet:meeting_ended_reason:room-1')).toBe('sid-unrelated');
	});

	it('is a no-op when no flag was ever set', async () => {
		const redisService = new FakeRedisService();
		const { service } = buildService(new FakeLiveKitService(), new FakeRoomRepository(), redisService);

		await expect(service.runClearMeetingEndedReason('room-1', 'sid-N')).resolves.toBeUndefined();
	});
});

describe('MeetingDurationLimitService duration-limit timers', () => {
	const roomId = 'room-timer';
	const maxDurationMinutes = 10;
	const taskName = MeetRoomHelper.durationLimitTimerName(roomId);
	const retryDelayMs = ms(INTERNAL_CONFIG.MEETING_DURATION_LIMIT_RETRY_DELAY);
	const reasonKey = `ov_meet:meeting_ended_reason:${roomId}`;
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

		service.scheduleMeetingEndAtDurationLimit(startedRoom(nowSeconds() - 60), maxDurationMinutes);

		const task = armedTask(taskScheduler);
		expect(task.type).toBe('timeout');
		expect(ms(task.scheduleOrDelay)).toBe(9 * 60_000);
	});

	it('arms for the deadline the meeting carries, not for the limit counted from the creation time', () => {
		const { service, taskScheduler } = buildService(new FakeLiveKitService(), new FakeRoomRepository());
		const metadata = JSON.stringify({ createdBy: 'openvidu-meet', endDate: nowMs + 2 * 60_000 });

		service.scheduleMeetingEndAtDurationLimit(
			startedRoom(nowSeconds() - 60, 'sid-timer', metadata),
			maxDurationMinutes
		);

		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(2 * 60_000);
	});

	it('arms an immediate task for a meeting that is already past its limit', () => {
		const { service, taskScheduler } = buildService(new FakeLiveKitService(), new FakeRoomRepository());

		service.scheduleMeetingEndAtDurationLimit(startedRoom(nowSeconds() - maxDurationMinutes * 60 - 120), 10);

		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(0);
	});

	it('replaces the timer left armed for an earlier meeting in the same room', () => {
		const { service, taskScheduler } = buildService(new FakeLiveKitService(), new FakeRoomRepository());

		service.scheduleMeetingEndAtDurationLimit(startedRoom(nowSeconds() - 9 * 60), maxDurationMinutes);
		service.scheduleMeetingEndAtDurationLimit(startedRoom(nowSeconds()), maxDurationMinutes);

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

		await service.runDurationLimitTimersGC();

		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(9 * 60_000);
		expect(livekitService.deletedRoomNames).toEqual([]);
	});

	it('leaves alone a room the sweep finds listed with no limit to enforce', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime: nowSeconds() - 60 });
		const roomRepository = new FakeRoomRepository();
		roomRepository.roomsWithMaxDuration = [{ roomId, config: { maxDurationMinutes: 0 } }];
		const { service, taskScheduler } = buildService(livekitService, roomRepository);

		await service.runDurationLimitTimersGC();

		expect(livekitService.deletedRoomNames).toEqual([]);
		expect(armCount(taskScheduler)).toBe(0);
	});

	it('does not end the meeting that started while the sweep waited for the room lock', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, {
			sid: 'sid-expired',
			creationTime: nowSeconds() - maxDurationMinutes * 60 - 120
		});
		const roomRepository = new FakeRoomRepository();
		roomRepository.roomsWithMaxDuration = [{ roomId, config: { maxDurationMinutes } }];
		const redisService = new FakeRedisService();
		const { service, mutexService } = buildService(livekitService, roomRepository, redisService);
		mutexService.onLockAcquired = () =>
			livekitService.rooms.set(roomId, { sid: 'sid-later', creationTime: nowSeconds() });

		await service.runDurationLimitTimersGC();

		expect(livekitService.deletedRoomNames).toEqual([]);
		expect(redisService.store.has(reasonKey)).toBe(false);
	});

	it('cancels the timer by the same name it was armed under', () => {
		const { service, taskScheduler } = buildService(new FakeLiveKitService(), new FakeRoomRepository());
		service.scheduleMeetingEndAtDurationLimit(startedRoom(nowSeconds()), maxDurationMinutes);

		service.cancelMeetingEndAtDurationLimit(roomId);

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
		service.scheduleMeetingEndAtDurationLimit(
			startedRoom(nowSeconds() - maxDurationMinutes * 60),
			maxDurationMinutes
		);

		await armedTask(taskScheduler).callback();

		expect(livekitService.deletedRoomNames).toEqual([roomId]);
		expect(redisService.store.get(reasonKey)).toBe('sid-timer');
		expect(mutexService.lockedKeys).toEqual([`ov_meet_lock:meeting_duration_limit_end_${roomId}`]);
		expect(armCount(taskScheduler)).toBe(1);
	});

	it('leaves a later meeting in the same room alone when a stale timer fires', async () => {
		const livekitService = new FakeLiveKitService();
		const redisService = new FakeRedisService();
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository(), redisService);
		service.scheduleMeetingEndAtDurationLimit(
			startedRoom(nowSeconds() - maxDurationMinutes * 60),
			maxDurationMinutes
		);
		// The meeting the timer was armed for is over and another one is running in the same room,
		// long enough to be past the limit the stale timer carries but not past its own.
		livekitService.rooms.set(roomId, {
			sid: 'sid-later',
			creationTime: nowSeconds() - maxDurationMinutes * 60 - 60
		});

		await armedTask(taskScheduler).callback();

		expect(livekitService.deletedRoomNames).toEqual([]);
		expect(redisService.store.has(reasonKey)).toBe(false);
		expect(armCount(taskScheduler)).toBe(1);
	});

	it('is a no-op when the meeting is already gone', async () => {
		const livekitService = new FakeLiveKitService();
		const redisService = new FakeRedisService();
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository(), redisService);
		service.scheduleMeetingEndAtDurationLimit(
			startedRoom(nowSeconds() - maxDurationMinutes * 60),
			maxDurationMinutes
		);

		await expect(armedTask(taskScheduler).callback()).resolves.toBeUndefined();

		expect(livekitService.deletedRoomNames).toEqual([]);
		expect(redisService.store.has(reasonKey)).toBe(false);
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
		service.scheduleMeetingEndAtDurationLimit(
			startedRoom(nowSeconds() - maxDurationMinutes * 60),
			maxDurationMinutes
		);
		mutexService.acquirable = false;

		await armedTask(taskScheduler).callback();

		expect(livekitService.deletedRoomNames).toEqual([]);
		expect(redisService.store.has(reasonKey)).toBe(false);
		expect(armCount(taskScheduler)).toBe(2);
		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(retryDelayMs);
	});

	it('retries when its own deleteRoom fails, rather than spending its one shot', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime: nowSeconds() - maxDurationMinutes * 60 });
		livekitService.deleteOutcome = 'error';
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository());
		service.scheduleMeetingEndAtDurationLimit(
			startedRoom(nowSeconds() - maxDurationMinutes * 60),
			maxDurationMinutes
		);

		await armedTask(taskScheduler).callback();

		expect(armCount(taskScheduler)).toBe(2);
		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(retryDelayMs);
	});

	it('retries when the LiveKit read throws, so an outage does not demote the meeting to the sweep', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime: nowSeconds() - maxDurationMinutes * 60 });
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository());
		service.scheduleMeetingEndAtDurationLimit(
			startedRoom(nowSeconds() - maxDurationMinutes * 60),
			maxDurationMinutes
		);
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
		service.scheduleMeetingEndAtDurationLimit(
			startedRoom(nowSeconds() - maxDurationMinutes * 60),
			maxDurationMinutes
		);

		for (let fire = 0; fire < 6; fire++) {
			await armedTask(taskScheduler).callback();
		}

		const armedDelays = taskScheduler.armed
			.filter(({ name }) => name === taskName)
			.map(({ scheduleOrDelay }) => ms(scheduleOrDelay));
		// The first delay is the arm itself, already past the limit; the rest are the retries.
		expect(armedDelays).toEqual([0, retryDelayMs, retryDelayMs * 2, retryDelayMs * 4, retryDelayMs * 8]);
		expect(retryDelayMs * 16).toBeGreaterThan(ms(INTERNAL_CONFIG.MEETING_DURATION_LIMIT_GC_INTERVAL));
	});

	it('retries at a delay exactly as slow as the sweep, but not slower', () => {
		const sweepIntervalMs = ms(INTERNAL_CONFIG.MEETING_DURATION_LIMIT_GC_INTERVAL);
		const { service, taskScheduler } = buildService(new FakeLiveKitService(), new FakeRoomRepository());
		const armedMeeting = startedRoom(nowSeconds());

		service.runRetryDurationLimitTimer(armedMeeting, maxDurationMinutes, sweepIntervalMs);
		service.runRetryDurationLimitTimer(armedMeeting, maxDurationMinutes, sweepIntervalMs + 1);

		expect(armCount(taskScheduler)).toBe(1);
		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(sweepIntervalMs);
	});

	it('ends the meeting when it fires a hair early, instead of arming a timer for a millisecond', async () => {
		// A millisecond short of its deadline, which is what a timer counting down on the monotonic
		// clock can read back off a wall clock that moved under it.
		const creationTime = (nowMs - maxDurationMinutes * 60_000 + 1) / 1000;
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime });
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository());
		service.scheduleMeetingEndAtDurationLimit(startedRoom(creationTime), maxDurationMinutes);

		await armedTask(taskScheduler).callback();

		expect(livekitService.deletedRoomNames).toEqual([roomId]);
		expect(armCount(taskScheduler)).toBe(1);
	});

	it('ends a meeting sitting exactly on the tolerance, rather than arming a timer for it', async () => {
		const creationTime =
			(nowMs - maxDurationMinutes * 60_000 + ms(INTERNAL_CONFIG.MEETING_DURATION_LIMIT_TOLERANCE)) / 1000;
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime });
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository());
		service.scheduleMeetingEndAtDurationLimit(startedRoom(creationTime), maxDurationMinutes);

		await armedTask(taskScheduler).callback();

		expect(livekitService.deletedRoomNames).toEqual([roomId]);
		expect(armCount(taskScheduler)).toBe(1);
	});

	it('re-arms for what is left when it fires further from the deadline than the tolerance', async () => {
		const remainingMs = ms(INTERNAL_CONFIG.MEETING_DURATION_LIMIT_TOLERANCE) + 1;
		const creationTime = (nowMs - maxDurationMinutes * 60_000 + remainingMs) / 1000;
		const livekitService = new FakeLiveKitService();
		livekitService.rooms.set(roomId, { sid: 'sid-timer', creationTime });
		const { service, taskScheduler } = buildService(livekitService, new FakeRoomRepository());
		service.scheduleMeetingEndAtDurationLimit(startedRoom(creationTime), maxDurationMinutes);

		await armedTask(taskScheduler).callback();

		expect(livekitService.deletedRoomNames).toEqual([]);
		expect(armCount(taskScheduler)).toBe(2);
		expect(ms(armedTask(taskScheduler).scheduleOrDelay)).toBe(remainingMs);
	});
});
