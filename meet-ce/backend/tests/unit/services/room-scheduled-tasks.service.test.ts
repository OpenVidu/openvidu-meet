import { describe, expect, it } from '@jest/globals';
import type { Room } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { RoomScheduledTasksService } from '../../../src/services/room-scheduled-tasks.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };
const noopTaskScheduler = { registerTask: () => {} };

class FakeLiveKitService {
	liveRoomNames: string[] = [];
	existingRoomNames = new Set<string>();
	rooms = new Map<string, { sid: string; creationTime: number }>();
	/** 'deleted' = deleteRoom really ended it; 'already-gone' = a no-op (room was gone already); 'error' = deleteRoom throws */
	deleteOutcome: 'deleted' | 'already-gone' | 'error' = 'deleted';
	deletedRoomNames: string[] = [];
	roomsExistError: Error | null = null;

	async listRooms(): Promise<Room[]> {
		return this.liveRoomNames.map((name) => ({ name }) as Room);
	}

	async roomsExist(roomNames: string[]): Promise<Map<string, boolean>> {
		if (this.roomsExistError) {
			throw this.roomsExistError;
		}

		return new Map(roomNames.map((name) => [name, this.existingRoomNames.has(name)]));
	}

	async getRoom(roomName: string): Promise<Room> {
		const room = this.rooms.get(roomName);

		if (!room) {
			throw new Error(`room '${roomName}' not found`);
		}

		return room as unknown as Room;
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
	reconciledRoomIds: string[] = [];
	cleanedUpRoomIds: string[] = [];
	failFor = new Set<string>();

	async handleRoomStarted({ name }: Room): Promise<void> {
		if (this.failFor.has(name)) {
			throw new Error(`boom for ${name}`);
		}

		this.reconciledRoomIds.push(name);
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
	const service = new TestableRoomScheduledTasksService(
		...([
			noopLogger,
			roomRepository,
			{},
			noopTaskScheduler,
			livekitService,
			livekitWebhookService,
			{},
			redisService
		] as unknown as ConstructorParameters<typeof RoomScheduledTasksService>)
	);
	return { service, livekitWebhookService };
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
