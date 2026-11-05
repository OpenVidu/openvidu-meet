import { describe, expect, it } from '@jest/globals';
import type { Room } from 'livekit-server-sdk';
import type { IScheduledTask } from '../../../src/models/task-scheduler.model.js';
import { RoomScheduledTasksService } from '../../../src/services/room-scheduled-tasks.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

class FakeTaskSchedulerService {
	armed: IScheduledTask[] = [];

	registerTask(task: IScheduledTask): void {
		this.armed.push(task);
	}
}

class FakeLiveKitService {
	liveRoomNames: string[] = [];
	existingRoomNames = new Set<string>();
	rooms = new Map<string, { sid: string; creationTime: number }>();
	roomsExistError: Error | null = null;

	async listRooms(): Promise<Room[]> {
		return this.liveRoomNames.map((name) => ({ name, ...this.rooms.get(name) }) as unknown as Room);
	}

	async roomsExist(roomNames: string[]): Promise<Map<string, boolean>> {
		if (this.roomsExistError) {
			throw this.roomsExistError;
		}

		return new Map(roomNames.map((name) => [name, this.existingRoomNames.has(name)]));
	}
}

class FakeRoomRepository {
	openRoomIds = new Set<string>();
	activeRoomIds: string[] = [];

	async findOpenRoomIds(roomIds: string[]): Promise<string[]> {
		return roomIds.filter((roomId) => this.openRoomIds.has(roomId));
	}

	async findActiveRooms(): Promise<{ rooms: { roomId: string }[]; isTruncated: boolean; nextPageToken?: string }> {
		return { rooms: this.activeRoomIds.map((roomId) => ({ roomId })), isTruncated: false };
	}
}

class FakeLivekitWebhookService {
	reconciledRooms: Room[] = [];
	/** Whole objects, not just ids: what the GC can name about a meeting is the point of C7. */
	cleanedUpRooms: { name: string; sid?: string }[] = [];
	failFor = new Set<string>();

	get reconciledRoomIds(): string[] {
		return this.reconciledRooms.map(({ name }) => name);
	}

	get cleanedUpRoomIds(): string[] {
		return this.cleanedUpRooms.map(({ name }) => name);
	}

	async handleRoomStarted(room: Room): Promise<void> {
		if (this.failFor.has(room.name)) {
			throw new Error(`boom for ${room.name}`);
		}

		this.reconciledRooms.push(room);
	}

	async handleRoomFinished(finishedRoom: { name: string; sid?: string }): Promise<void> {
		this.cleanedUpRooms.push(finishedRoom);
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
}

const buildService = (livekitService: FakeLiveKitService, roomRepository: FakeRoomRepository) => {
	const livekitWebhookService = new FakeLivekitWebhookService();
	const taskScheduler = new FakeTaskSchedulerService();
	const service = new TestableRoomScheduledTasksService(
		...([
			noopLogger,
			roomRepository,
			{},
			taskScheduler,
			livekitService,
			livekitWebhookService
		] as unknown as ConstructorParameters<typeof RoomScheduledTasksService>)
	);
	return { service, livekitWebhookService, taskScheduler };
};

describe('RoomScheduledTasksService (the GC schedule it installs on construction)', () => {
	it('schedules the two room GC tasks', () => {
		const { taskScheduler } = buildService(new FakeLiveKitService(), new FakeRoomRepository());

		expect(taskScheduler.armed.map(({ name, type }) => ({ name, type }))).toEqual([
			{ name: 'expiredRoomsGC', type: 'cron' },
			{ name: 'validateRoomsStatusGC', type: 'cron' }
		]);
	});
});

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
describe('RoomScheduledTasksService.reconcileActiveMeetingsGoneFromLiveKit (only the rooms LiveKit forgot are cleaned up)', () => {
	it('cleans up the rooms LiveKit no longer has and leaves the live ones alone', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.existingRoomNames = new Set(['room-live']);
		const roomRepository = new FakeRoomRepository();
		roomRepository.activeRoomIds = ['room-live', 'room-gone'];
		const { service, livekitWebhookService } = buildService(livekitService, roomRepository);

		await service.runReconcileActiveMeetingsGoneFromLiveKit();

		expect(livekitWebhookService.cleanedUpRoomIds).toEqual(['room-gone']);
	});

	it('touches nothing while every active room is still live in LiveKit', async () => {
		const livekitService = new FakeLiveKitService();
		livekitService.existingRoomNames = new Set(['room-a', 'room-b']);
		const roomRepository = new FakeRoomRepository();
		roomRepository.activeRoomIds = ['room-a', 'room-b'];
		const { service, livekitWebhookService } = buildService(livekitService, roomRepository);

		await service.runReconcileActiveMeetingsGoneFromLiveKit();

		expect(livekitWebhookService.cleanedUpRoomIds).toEqual([]);
	});
});

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
