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

	async listRooms(): Promise<Room[]> {
		return this.liveRoomNames.map((name) => ({ name }) as Room);
	}

	async roomsExist(roomNames: string[]): Promise<Map<string, boolean>> {
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

class TestableRoomScheduledTasksService extends RoomScheduledTasksService {
	runReconcileOpenRoomsGC(): Promise<void> {
		return this.reconcileOpenRoomsGC();
	}

	runValidateRoomsStatusGC(): Promise<void> {
		return this.validateRoomsStatusGC();
	}
}

const buildService = (livekitService: FakeLiveKitService, roomRepository: FakeRoomRepository) => {
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
			{}
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
