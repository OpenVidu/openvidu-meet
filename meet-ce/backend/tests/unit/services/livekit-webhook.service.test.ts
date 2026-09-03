import { describe, expect, it } from '@jest/globals';
import { MeetingEndAction, MeetMeetingEndedCause, MeetRoomStatus } from '@openvidu-meet/typings';
import type { Room } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
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
}

class TestableLivekitWebhookService extends LivekitWebhookService {
	runGetMeetingEndedCause(roomId: string, meetingId: string): Promise<MeetMeetingEndedCause | undefined> {
		return this.getMeetingEndedCause(roomId, meetingId);
	}
}

const buildService = (redis: FakeRedisService) =>
	new TestableLivekitWebhookService(
		...([{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, redis, {}] as unknown as ConstructorParameters<
			typeof LivekitWebhookService
		>)
	);

/**
 * Reads the MEETING_ENDED_CAUSE flag that RoomScheduledTasksService stamps before force-ending a
 * meeting for exceeding its duration limit, deciding whether the meetingEnded webhook carries an
 * attributed cause instead of reading as a moderator's own end.
 */
describe('LivekitWebhookService.getMeetingEndedCause (force-end attribution flag)', () => {
	it('is undefined when no flag was ever set (a normal end)', async () => {
		const service = buildService(new FakeRedisService());

		await expect(service.runGetMeetingEndedCause('room-1', 'sid-N')).resolves.toBeUndefined();
	});

	it('is MAX_DURATION_REACHED when the flag matches the finishing meeting', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_cause:room-1', 'sid-N');
		const service = buildService(redis);

		await expect(service.runGetMeetingEndedCause('room-1', 'sid-N')).resolves.toBe(
			MeetMeetingEndedCause.MAX_DURATION_REACHED
		);
	});

	it('is undefined when the flag belongs to a different (stale) meeting in the same room', async () => {
		const redis = new FakeRedisService();
		await redis.set('ov_meet:meeting_ended_cause:room-1', 'sid-OLD');
		const service = buildService(redis);

		await expect(service.runGetMeetingEndedCause('room-1', 'sid-NEW')).resolves.toBeUndefined();
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
		private maxDurationMinutes?: number
	) {}

	async getMeetRoom() {
		return { status: this.status, config: { maxDurationMinutes: this.maxDurationMinutes } };
	}
}

class FakeRoomScheduledTasksService {
	scheduled: { room: Room; maxDurationMinutes: number }[] = [];
	cancelled: string[] = [];

	scheduleMeetingMaxDurationEnd(room: Room, maxDurationMinutes: number): void {
		this.scheduled.push({ room, maxDurationMinutes });
	}

	cancelMeetingMaxDurationEnd(roomId: string): void {
		this.cancelled.push(roomId);
	}
}

class FakeRoomRepository {
	updatePartialCalls: Array<{ roomId: string; fields: unknown }> = [];

	async updatePartial(roomId: string, fields: unknown) {
		this.updatePartialCalls.push({ roomId, fields });
		return { roomId, ...(fields as object) };
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

	sendMeetingStartedWebhook(room: unknown) {
		this.sendMeetingStartedWebhookCalls.push(room);
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

		expect(roomRepository.updatePartialCalls).toEqual([]);
		expect(webhookDispatcherService.sendMeetingStartedWebhookCalls).toEqual([]);
		expect(livekitService.deleteRoomCalls).toEqual(['room-1']);
	});

	it('activates an open room and sends the meeting-started webhook', async () => {
		const { service, roomRepository, livekitService, webhookDispatcherService } = buildRoomStartedService(
			new FakeRoomService(MeetRoomStatus.OPEN)
		);

		await service.handleRoomStarted({ name: 'room-1', sid: 'sid-1' } as unknown as Room);

		expect(roomRepository.updatePartialCalls).toEqual([
			{ roomId: 'room-1', fields: { status: MeetRoomStatus.ACTIVE_MEETING } }
		]);
		expect(webhookDispatcherService.sendMeetingStartedWebhookCalls).toHaveLength(1);
		expect(livekitService.deleteRoomCalls).toEqual([]);
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

	it('disarms the timer when the meeting finishes by any other means', async () => {
		const service = new TestableRoomLifecycleService(
			...([
				{ reactivateAutoRecording: async () => {}, releaseRecordingLockIfNoEgress: async () => {} },
				{},
				new FakeLiveKitService(),
				{ getMeetRoom: async () => ({ roomId: 'room-1', meetingEndAction: MeetingEndAction.NONE }) },
				new FakeRoomRepository(),
				{ sendMeetingEndedWebhook: () => {} },
				{},
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
