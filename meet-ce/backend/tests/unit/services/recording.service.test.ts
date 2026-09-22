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
	egressQueries = 0;

	constructor(private inProgress: Partial<EgressInfo>[]) {}

	async getInProgressRecordingsEgress(): Promise<EgressInfo[]> {
		this.egressQueries++;
		return this.inProgress as EgressInfo[];
	}
}

class FakeMutexService {
	released: string[] = [];

	constructor(private held = true) {}

	async lockRegistryExists(): Promise<boolean> {
		return this.held;
	}

	async releaseWithRegistry(key: string): Promise<void> {
		this.released.push(key);
	}
}

const buildService = (livekit: FakeLiveKitService, mutex: FakeMutexService) =>
	new RecordingService(
		...([livekit, mutex, {}, {}, {}, {}, {}, noopLogger] as unknown as ConstructorParameters<
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

/**
 * S6 (MEET-API-CONTRACT-AUDIT-FINDINGS.md): every meeting end asks for the release, so a room that
 * never recorded used to reach the registry and log a WARN for a lock nobody ever took.
 */
describe('RecordingService.releaseRecordingLockIfNoEgress - S6: a lock nobody holds is not released', () => {
	it('returns before querying LiveKit or the registry when the lock is not held', async () => {
		const livekit = new FakeLiveKitService([]);
		const mutex = new FakeMutexService(false);
		const service = buildService(livekit, mutex);

		await service.releaseRecordingLockIfNoEgress('room-1');

		expect(livekit.egressQueries).toBe(0);
		expect(mutex.released).toEqual([]);
	});

	it('still releases a held lock', async () => {
		const livekit = new FakeLiveKitService([]);
		const mutex = new FakeMutexService();
		const service = buildService(livekit, mutex);

		await service.releaseRecordingLockIfNoEgress('room-1');

		expect(livekit.egressQueries).toBe(1);
		expect(mutex.released).toEqual([expect.stringContaining('room-1')]);
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
	acquirable = true;

	async acquireWithRegistry(key: string): Promise<object | null> {
		return this.acquirable ? { key } : null;
	}

	async lockRegistryExists(): Promise<boolean> {
		return true;
	}

	async releaseWithRegistry(key: string): Promise<void> {
		this.released.push(key);
	}
}

class FakeAutoStartState {
	reads: [string, string][] = [];
	thresholdReached = true;

	constructor(private disabled: boolean) {}

	async isDisabled(roomId: string, meetingId: string): Promise<boolean> {
		this.reads.push([roomId, meetingId]);
		return this.disabled;
	}

	hasReachedAutoStartThreshold(): boolean {
		return this.thresholdReached;
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
		...([livekit, mutex, {}, {}, {}, frontendEvents, latch, noopLogger] as unknown as ConstructorParameters<
			typeof RecordingService
		>)
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

describe('RecordingService.startRecording (the guards that say no)', () => {
	it('answers 409 without asking LiveKit for an egress when the room is already recording', async () => {
		const { service, livekit, mutex } = buildStartService(false);
		mutex.acquirable = false;

		await expect(service.startRecording(ROOM_ID)).rejects.toMatchObject({ statusCode: 409 });

		expect(livekit.composites).toEqual([]);
	});
});

describe('RecordingService.startAutoRecordingIfNeeded (the guards that say no)', () => {
	const autoStartMode = MeetRecordingAutoStartMode.WHEN_FIRST_PARTICIPANT_JOINS;

	const buildAutoStartService = (config: unknown, latchDisabled = false) => {
		const { service, latch } = buildStartService(latchDisabled);
		(service as unknown as { getRoomService: () => Promise<unknown> }).getRoomService = async () => ({
			getMeetRoom: async () => ({ config })
		});

		const starts: unknown[][] = [];
		service.startRecording = async (...args) => {
			starts.push(args);
			return { recordingId: 'rec-1' } as Awaited<ReturnType<RecordingService['startRecording']>>;
		};

		const start = () =>
			service.startAutoRecordingIfNeeded(
				{ name: ROOM_ID, sid: MEETING_ID } as Room,
				{ identity: 'participant-1' } as ParticipantInfo
			);

		return { start, starts, latch };
	};

	it.each([
		['recording is off for the room', { enabled: false, autoStart: autoStartMode }, { enabled: false }],
		['the room does not auto-start', { enabled: true, autoStart: null }, { enabled: false }],
		['the meeting is end-to-end encrypted', { enabled: true, autoStart: autoStartMode }, { enabled: true }]
	])('does not start a recording when %s', async (_case, recording, e2ee) => {
		const { start, starts } = buildAutoStartService({ recording, e2ee });

		await start();

		expect(starts).toEqual([]);
	});

	it('does not start again after a deliberate stop in the same meeting', async () => {
		const { start, starts } = buildAutoStartService(
			{ recording: { enabled: true, autoStart: autoStartMode }, e2ee: { enabled: false } },
			true
		);

		await start();

		expect(starts).toEqual([]);
	});

	it('does not start before the meeting reaches the threshold of the configured preset', async () => {
		const { start, starts, latch } = buildAutoStartService({
			recording: { enabled: true, autoStart: autoStartMode },
			e2ee: { enabled: false }
		});
		latch.thresholdReached = false;

		await start();

		expect(starts).toEqual([]);
	});
});
