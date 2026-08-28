import { describe, expect, it } from '@jest/globals';
import { MeetRecordingAutoStartMode } from '@openvidu-meet/typings';
import type { ParticipantInfo, Room } from 'livekit-server-sdk';
import { EgressInfo, EgressStatus } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { RecordingService } from '../../../src/services/recording.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

class FakeLiveKitService {
	constructor(private inProgress: Partial<EgressInfo>[]) {}

	async getInProgressRecordingsEgress(): Promise<EgressInfo[]> {
		return this.inProgress as EgressInfo[];
	}
}

class FakeMutexService {
	released: string[] = [];

	async releaseWithRegistry(key: string): Promise<void> {
		this.released.push(key);
	}
}

const buildService = (livekit: FakeLiveKitService, mutex: FakeMutexService) =>
	new RecordingService(
		...([livekit, mutex, {}, {}, {}, {}, {}, {}, noopLogger] as unknown as ConstructorParameters<
			typeof RecordingService
		>)
	);

/**
 * B3 (MEET-BRANCH-AUDIT-FINDINGS.md): the release check used to only look at EGRESS_ACTIVE, so a
 * duplicate/stale `egress_ended` for a previous egress arriving while a *new* one is still
 * EGRESS_STARTING released the lock — a concurrent request could then re-acquire it and start a
 * second recording. It must treat STARTING and ENDING as "still in progress" too.
 */
describe('RecordingService.releaseRecordingLockIfNoEgress — B3: STARTING egress must block release', () => {
	it('releases the lock when there is no recording egress at all', async () => {
		const mutex = new FakeMutexService();
		const service = buildService(new FakeLiveKitService([]), mutex);

		await service.releaseRecordingLockIfNoEgress('room-1');

		expect(mutex.released).toEqual([expect.stringContaining('room-1')]);
	});

	it('keeps the lock held while a new egress is still STARTING, not just ACTIVE', async () => {
		const mutex = new FakeMutexService();
		const service = buildService(
			new FakeLiveKitService([{ egressId: 'eg-1', status: EgressStatus.EGRESS_STARTING }]),
			mutex
		);

		await service.releaseRecordingLockIfNoEgress('room-1');

		expect(mutex.released).toEqual([]);
	});

	it('keeps the lock held for an ENDING egress', async () => {
		const mutex = new FakeMutexService();
		const service = buildService(
			new FakeLiveKitService([{ egressId: 'eg-1', status: EgressStatus.EGRESS_ENDING }]),
			mutex
		);

		await service.releaseRecordingLockIfNoEgress('room-1');

		expect(mutex.released).toEqual([]);
	});

	it('keeps the lock held for an ACTIVE egress', async () => {
		const mutex = new FakeMutexService();
		const service = buildService(
			new FakeLiveKitService([{ egressId: 'eg-1', status: EgressStatus.EGRESS_ACTIVE }]),
			mutex
		);

		await service.releaseRecordingLockIfNoEgress('room-1');

		expect(mutex.released).toEqual([]);
	});
});

const ROOM_ID = 'room-1';
const MEETING_ID = 'RM_meeting_1';

class FakeStartLiveKitService {
	composites: string[] = [];

	async startRoomComposite(roomId: string): Promise<never> {
		this.composites.push(roomId);
		throw new Error('unexpected egress start');
	}

	async getInProgressRecordingsEgress(): Promise<EgressInfo[]> {
		return [];
	}

	async listStandardParticipants(): Promise<ParticipantInfo[]> {
		return [];
	}
}

class FakeLockMutexService {
	released: string[] = [];

	async acquireWithRegistry(key: string): Promise<object> {
		return { key };
	}

	async releaseWithRegistry(key: string): Promise<void> {
		this.released.push(key);
	}
}

class FakeAutoStartState {
	reads: [string, string][] = [];

	constructor(private disabled: boolean) {}

	async isDisabled(roomId: string, meetingId: string): Promise<boolean> {
		this.reads.push([roomId, meetingId]);
		return this.disabled;
	}

	hasReachedAutoStartThreshold(): boolean {
		return true;
	}
}

class FakeFrontendEventService {
	signals: unknown[][] = [];

	async sendRecordingUpdatedSignal(...args: unknown[]): Promise<void> {
		this.signals.push(args);
	}
}

const buildStartService = (latchDisabled: boolean) => {
	const livekit = new FakeStartLiveKitService();
	const mutex = new FakeLockMutexService();
	const frontendEvents = new FakeFrontendEventService();
	const latch = new FakeAutoStartState(latchDisabled);
	const service = new RecordingService(
		...([
			livekit,
			mutex,
			{ on: () => {}, off: () => {} },
			{},
			{},
			{},
			frontendEvents,
			latch,
			noopLogger
		] as unknown as ConstructorParameters<typeof RecordingService>)
	);
	return { service, livekit, mutex, frontendEvents, latch };
};

// Cuts the flow short right after the latch recheck: the real method resolves RoomService
// through the DI container, which a unit test cannot reach.
const failAtRoomValidation = (service: RecordingService) => {
	(service as unknown as { validateRoomForStartRecording: () => Promise<never> }).validateRoomForStartRecording =
		async () => {
			throw new Error('reached room validation');
		};
};

/**
 * B8 (MEET-BRANCH-AUDIT-FINDINGS.md): the deliberate-stop latch used to be read only before
 * acquiring the recording_active lock, so a stop completing in the gap let a join acquire the
 * freed lock and restart past the latch. An auto-start now re-checks the latch under the lock —
 * a stop writes it before its egress_ended releases the lock, so it is always visible there.
 */
describe('RecordingService.startRecording — B8: the deliberate-stop latch is re-checked under the lock', () => {
	it('aborts an auto-start whose latch was written after the caller pre-checked it, releasing the lock', async () => {
		const { service, livekit, mutex, frontendEvents, latch } = buildStartService(true);

		const start = service.startRecording(ROOM_ID, undefined, MEETING_ID);
		await expect(start).rejects.toThrow(`Recording auto-start in room '${ROOM_ID}' is disabled`);
		await expect(start).rejects.toMatchObject({ statusCode: 409 });

		expect(latch.reads).toEqual([[ROOM_ID, MEETING_ID]]);
		expect(livekit.composites).toEqual([]);
		expect(frontendEvents.signals).toEqual([]);
		expect(mutex.released).toEqual([expect.stringContaining(ROOM_ID)]);
	});

	it('lets an auto-start proceed while the latch is clear', async () => {
		const { service, latch } = buildStartService(false);
		failAtRoomValidation(service);

		await expect(service.startRecording(ROOM_ID, undefined, MEETING_ID)).rejects.toThrow('reached room validation');

		expect(latch.reads).toEqual([[ROOM_ID, MEETING_ID]]);
	});

	it('never consults the latch for a manual start', async () => {
		const { service, latch } = buildStartService(true);
		failAtRoomValidation(service);

		await expect(service.startRecording(ROOM_ID)).rejects.toThrow('reached room validation');

		expect(latch.reads).toEqual([]);
	});

	it('startAutoRecordingIfNeeded hands the meeting sid to startRecording for the under-lock recheck', async () => {
		const { service } = buildStartService(false);
		(service as unknown as { getRoomService: () => Promise<unknown> }).getRoomService = async () => ({
			getMeetRoom: async () => ({
				config: {
					recording: { enabled: true, autoStart: MeetRecordingAutoStartMode.WHEN_FIRST_PARTICIPANT_JOINS },
					e2ee: { enabled: false }
				}
			})
		});

		let startArgs: unknown[] | undefined;
		service.startRecording = async (...args) => {
			startArgs = args;
			return { recordingId: 'rec-1' } as Awaited<ReturnType<RecordingService['startRecording']>>;
		};

		await service.startAutoRecordingIfNeeded(
			{ name: ROOM_ID, sid: MEETING_ID } as Room,
			{ identity: 'participant-1' } as ParticipantInfo
		);

		expect(startArgs).toEqual([ROOM_ID, undefined, MEETING_ID]);
	});
});
