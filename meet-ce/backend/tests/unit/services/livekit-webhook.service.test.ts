import { describe, expect, it } from '@jest/globals';
import { MeetMeetingEndedCause, MeetRoomStatus } from '@openvidu-meet/typings';
import type { Room } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { LivekitWebhookService } from '../../../src/services/livekit-webhook.service.js';

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
	constructor(private status: MeetRoomStatus) {}

	async getMeetRoom() {
		return { status: this.status };
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

const buildRoomStartedService = (roomService: FakeRoomService) => {
	const roomRepository = new FakeRoomRepository();
	const livekitService = new FakeLiveKitService();
	const webhookDispatcherService = new FakeWebhookDispatcherService();
	const service = new LivekitWebhookService(
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
