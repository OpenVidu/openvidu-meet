import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ParticipantInfo_Kind } from '@livekit/protocol';
import type { MeetRecordingInfo } from '@openvidu-meet/typings';
import { MeetRecordingAutoStartMode, MeetRecordingStatus } from '@openvidu-meet/typings';
import type { ParticipantInfo, Room } from 'livekit-server-sdk';
import { EgressInfo, EgressStatus } from 'livekit-server-sdk';
import { PassThrough, Readable } from 'stream';
import {
	errorLivekitNotAvailable,
	errorRecordingAlreadyStopped,
	errorRecordingStopInProgress
} from '../../../src/models/error.model.js';
import { RecordingService } from '../../../src/services/recording.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

const RECORDING_ID = 'room-1--EG_1--uid1';

const recordingEgress = (status: EgressStatus) =>
	new EgressInfo({ egressId: 'EG_1', roomName: 'room-1', status, fileResults: [{ filename: 'room-1--uid1.mp4' }] });

class FakeLiveKitService {
	egressQueries = 0;
	stops: string[] = [];

	constructor(private inProgress: EgressInfo[]) {}

	async getInProgressRecordingsEgress(): Promise<EgressInfo[]> {
		this.egressQueries++;
		return this.inProgress;
	}

	async getEgress(): Promise<EgressInfo[]> {
		return this.inProgress;
	}

	async stopEgressIfRunning(egressId: string): Promise<EgressInfo> {
		this.stops.push(egressId);
		return this.inProgress[0];
	}
}

class FakeRecordingRepository {
	constructor(private statuses: Record<string, MeetRecordingStatus> = {}) {}

	async findByRecordingId(recordingId: string) {
		const status = this.statuses[recordingId];
		return status ? { recordingId, status } : null;
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

const buildService = (
	livekit: FakeLiveKitService,
	mutex: FakeMutexService,
	recordings = new FakeRecordingRepository()
) =>
	new RecordingService(
		...([livekit, mutex, recordings, {}, {}, {}, {}, {}, noopLogger] as unknown as ConstructorParameters<
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
		const service = buildService(new FakeLiveKitService([recordingEgress(EgressStatus.EGRESS_STARTING)]), mutex);

		await service.releaseRecordingLockIfNoEgress('room-1');

		expect(mutex.released).toEqual([]);
	});

	it('keeps the lock held for an ENDING egress', async () => {
		const mutex = new FakeMutexService();
		const service = buildService(new FakeLiveKitService([recordingEgress(EgressStatus.EGRESS_ENDING)]), mutex);

		await service.releaseRecordingLockIfNoEgress('room-1');

		expect(mutex.released).toEqual([]);
	});

	it('keeps the lock held for an ACTIVE egress', async () => {
		const mutex = new FakeMutexService();
		const service = buildService(new FakeLiveKitService([recordingEgress(EgressStatus.EGRESS_ACTIVE)]), mutex);

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

/**
 * LiveKit keeps listing as in progress an egress whose egress service died, and Meet ends that
 * recording itself, so a recording in progress is one that LiveKit and Meet both still run.
 */
describe('RecordingService.getInProgressEgresses (an egress LiveKit lists after its service died)', () => {
	it('leaves out an egress whose recording Meet has already ended', async () => {
		const service = buildService(
			new FakeLiveKitService([recordingEgress(EgressStatus.EGRESS_ACTIVE)]),
			new FakeMutexService(),
			new FakeRecordingRepository({ [RECORDING_ID]: MeetRecordingStatus.FAILED })
		);

		await expect(service.getInProgressEgresses('room-1')).resolves.toEqual([]);
	});

	it.each([
		['is still in progress in Meet', { [RECORDING_ID]: MeetRecordingStatus.ACTIVE }],
		['Meet has not saved yet, which is still starting', {}]
	])('keeps an egress whose recording %s', async (_case, statuses) => {
		const egress = recordingEgress(EgressStatus.EGRESS_ACTIVE);
		const service = buildService(
			new FakeLiveKitService([egress]),
			new FakeMutexService(),
			new FakeRecordingRepository(statuses)
		);

		await expect(service.getInProgressEgresses('room-1')).resolves.toEqual([egress]);
	});

	it('releases the lock of a room whose listed egress belongs to a recording Meet has ended', async () => {
		const mutex = new FakeMutexService();
		const service = buildService(
			new FakeLiveKitService([recordingEgress(EgressStatus.EGRESS_ACTIVE)]),
			mutex,
			new FakeRecordingRepository({ [RECORDING_ID]: MeetRecordingStatus.FAILED })
		);

		await service.releaseRecordingLockIfNoEgress('room-1');

		expect(mutex.released).toEqual([expect.stringContaining('room-1')]);
	});

	it('answers 409 to a stop of that recording without stopping its egress', async () => {
		const livekit = new FakeLiveKitService([recordingEgress(EgressStatus.EGRESS_ACTIVE)]);
		const service = new RecordingService(
			...([
				livekit,
				{ withLock: async (_key: string, _ttl: number, task: () => Promise<unknown>) => task() },
				new FakeRecordingRepository({ [RECORDING_ID]: MeetRecordingStatus.FAILED }),
				{},
				{},
				{},
				{},
				{},
				noopLogger
			] as unknown as ConstructorParameters<typeof RecordingService>)
		);

		await expect(service.stopRecording(RECORDING_ID)).rejects.toMatchObject({ statusCode: 409 });

		expect(livekit.stops).toEqual([]);
	});
});

const ROOM_ID = 'room-1';
const MEETING_ID = 'RM_meeting_1';

class FakeStartLiveKitService {
	composites: string[] = [];
	egressQueries = 0;
	inProgress: Partial<EgressInfo>[] = [];

	async startRoomComposite(roomId: string): Promise<never> {
		this.composites.push(roomId);
		throw new Error('unexpected egress start');
	}

	async getInProgressRecordingsEgress(): Promise<EgressInfo[]> {
		this.egressQueries++;
		return this.inProgress as EgressInfo[];
	}

	async listRoomParticipants(): Promise<ParticipantInfo[]> {
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
		...([livekit, mutex, {}, {}, {}, frontendEvents, latch, {}, noopLogger] as unknown as ConstructorParameters<
			typeof RecordingService
		>)
	);
	return { service, livekit, mutex, frontendEvents, latch };
};

// Cuts the flow short right after the latch recheck, before the room is read.
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
		Object.assign(service, {
			roomRepository: {
				findByRoomId: async () => ({
					config: {
						recording: {
							enabled: true,
							autoStart: MeetRecordingAutoStartMode.WHEN_FIRST_PARTICIPANT_JOINS
						},
						e2ee: { enabled: false }
					}
				})
			}
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

describe('RecordingService.startRecording (a failed start releases the room hold)', () => {
	it('releases the hold without asking the media server when it fails before requesting the egress', async () => {
		const { service, livekit, mutex } = buildStartService(false);
		(service as unknown as { validateRoomForStartRecording: () => Promise<never> }).validateRoomForStartRecording =
			async () => {
				throw errorLivekitNotAvailable();
			};

		await expect(service.startRecording(ROOM_ID)).rejects.toMatchObject({ statusCode: 503 });

		expect(livekit.egressQueries).toBe(0);
		expect(mutex.released).toEqual([expect.stringContaining(ROOM_ID)]);
	});

	it('keeps the hold while the media server reports an egress the failed request left behind', async () => {
		const { service, livekit, mutex } = buildStartService(false);
		Object.assign(service, {
			validateRoomForStartRecording: async () => ({}),
			generateCompositeOptionsFromRequest: () => ({}),
			generateFileOutputFromRequest: () => ({})
		});
		livekit.inProgress = [{ egressId: 'EG_1' }];

		await expect(service.startRecording(ROOM_ID)).rejects.toThrow('unexpected egress start');

		expect(livekit.egressQueries).toBe(1);
		expect(mutex.released).toEqual([]);
	});
});

describe('RecordingService.startAutoRecordingIfNeeded (the guards that say no)', () => {
	const autoStartMode = MeetRecordingAutoStartMode.WHEN_FIRST_PARTICIPANT_JOINS;

	const buildAutoStartService = (config: unknown, latchDisabled = false) => {
		const { service, latch } = buildStartService(latchDisabled);
		Object.assign(service, {
			roomRepository: { findByRoomId: async () => ({ config }) }
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

describe('RecordingService.startAutoRecordingIfNeeded (who counts towards the threshold)', () => {
	it('counts the people in the meeting, never its recorders or agents', async () => {
		const { service, livekit, latch } = buildStartService(false);
		Object.assign(service, {
			roomRepository: {
				findByRoomId: async () => ({
					config: {
						recording: {
							enabled: true,
							autoStart: MeetRecordingAutoStartMode.WHEN_FIRST_PARTICIPANT_JOINS
						},
						e2ee: { enabled: false }
					}
				})
			}
		});
		const person = { identity: 'participant-1', kind: ParticipantInfo_Kind.STANDARD } as ParticipantInfo;
		livekit.listRoomParticipants = async () => [
			person,
			{ identity: 'EG_1', kind: ParticipantInfo_Kind.EGRESS } as ParticipantInfo,
			{ identity: 'agent-1', kind: ParticipantInfo_Kind.AGENT } as ParticipantInfo
		];
		const threshold = jest.fn((..._args: unknown[]) => false);
		latch.hasReachedAutoStartThreshold = threshold;

		await service.startAutoRecordingIfNeeded({ name: ROOM_ID, sid: MEETING_ID } as Room, person);

		expect(threshold).toHaveBeenCalledWith(ROOM_ID, expect.anything(), person, [person]);
	});
});

describe('RecordingService.finishRecording', () => {
	const ended = { recordingId: 'room-1--EG_1--uid', roomId: 'room-1', status: MeetRecordingStatus.ABORTED };

	const buildFinishService = ({ stored = true, livekit = new FakeLiveKitService([]) } = {}) => {
		let status = stored ? MeetRecordingStatus.ACTIVE : undefined;
		const repository = {
			replaceInProgress: async (recording: MeetRecordingInfo) => {
				if (status !== MeetRecordingStatus.ACTIVE) return null;

				status = recording.status;
				return recording;
			},
			findByRecordingId: async () => (status ? { status } : null)
		};
		const events: unknown[][] = [];
		const mutex = new FakeMutexService();
		mutex.releaseWithRegistry = async (key: string) => {
			events.push(['release', key]);
		};
		const frontendEvents = {
			sendRecordingUpdatedSignal: async (...args: unknown[]) => {
				events.push(['signal', ...args]);
			}
		};
		const webhookDispatcher = {
			sendRecordingEndedWebhook: (recording: MeetRecordingInfo) => events.push(['webhook', recording])
		};
		const service = new RecordingService(
			...([
				livekit,
				mutex,
				repository,
				{},
				{},
				frontendEvents,
				{},
				webhookDispatcher,
				noopLogger
			] as unknown as ConstructorParameters<typeof RecordingService>)
		);
		return { service, events };
	};

	it('releases the room hold, then reports the end it stores: webhook and in-meeting signal', async () => {
		const { service, events } = buildFinishService();

		expect(await service.finishRecording(ended as MeetRecordingInfo)).toBe(true);

		expect(events).toEqual([
			['release', expect.stringContaining('room-1')],
			['webhook', ended],
			['signal', 'room-1', ended]
		]);
	});

	it('neither reports nor releases again for a recording that had already ended', async () => {
		const { service, events } = buildFinishService();
		await service.finishRecording(ended as MeetRecordingInfo);
		events.length = 0;

		expect(await service.finishRecording(ended as MeetRecordingInfo)).toBe(false);

		expect(events).toEqual([]);
	});

	it('releases the room hold, reporting nothing, for the end of a recording that was never stored', async () => {
		const { service, events } = buildFinishService({ stored: false });

		expect(await service.finishRecording(ended as MeetRecordingInfo)).toBe(false);

		expect(events).toEqual([['release', expect.stringContaining('room-1')]]);
	});

	it('still reports the end when the room hold cannot be checked', async () => {
		const livekit = new FakeLiveKitService([]);
		livekit.getInProgressRecordingsEgress = async () => {
			throw errorLivekitNotAvailable();
		};
		const { service, events } = buildFinishService({ livekit });

		expect(await service.finishRecording(ended as MeetRecordingInfo)).toBe(true);

		expect(events).toEqual([
			['webhook', ended],
			['signal', 'room-1', ended]
		]);
	});
});

describe('RecordingService.stopRecording', () => {
	const recordingId = 'room-1--EG_1--uid';

	const buildStopService = (egresses: Partial<EgressInfo>[]) => {
		const stopped: string[] = [];
		const livekit = {
			getEgress: async () => egresses,
			stopEgress: async (egressId: string) => stopped.push(egressId)
		};
		const mutex = { withLock: async (_key: string, _ttl: number, run: () => Promise<unknown>) => run() };
		const latch = { disabled: [] as string[], markDisabled: async (roomId: string) => latch.disabled.push(roomId) };
		const service = new RecordingService(
			...([livekit, mutex, {}, {}, {}, {}, latch, {}, noopLogger] as unknown as ConstructorParameters<
				typeof RecordingService
			>)
		);
		return { service, stopped, latch };
	};

	it('answers 409 for a recording whose egress the media server no longer knows', async () => {
		const { service, stopped, latch } = buildStopService([]);

		await expect(service.stopRecording(recordingId)).rejects.toMatchObject({
			statusCode: 409,
			message: errorRecordingAlreadyStopped(recordingId).message
		});
		expect(stopped).toEqual([]);
		expect(latch.disabled).toEqual([]);
	});

	const liveEgress = (status: EgressStatus) => new EgressInfo({ ...recordingEgress(status), roomId: 'RM_meeting' });

	it.each([
		['active', EgressStatus.EGRESS_ACTIVE],
		['starting', EgressStatus.EGRESS_STARTING]
	])(
		'stops a recording whose egress is %s, disarming the auto-start for the meeting first',
		async (_case, status) => {
			const egress = liveEgress(status);
			const { service } = buildStopService([egress]);
			const disarmed: string[][] = [];
			const stopped: string[] = [];
			Object.assign(service, {
				recAutoStartStateService: {
					markDisabled: async (roomId: string, meetingId: string) => disarmed.push([roomId, meetingId])
				}
			});
			Object.assign((service as unknown as { livekitService: object }).livekitService, {
				stopEgressIfRunning: async (egressId: string) => {
					expect(disarmed).toEqual([['room-1', 'RM_meeting']]);
					stopped.push(egressId);
					return egress;
				}
			});
			Object.assign(service, { recordingRepository: { findByRecordingId: async () => null } });
			const info = { recordingId, status: MeetRecordingStatus.ENDING } as MeetRecordingInfo;
			jest.spyOn(service, 'toRecordingInfo').mockResolvedValue(info);

			await expect(service.stopRecording(recordingId)).resolves.toBe(info);
			expect(stopped).toEqual(['EG_1']);
			jest.restoreAllMocks();
		}
	);

	it('answers 409 when the egress ended between the check and the stop', async () => {
		const { service } = buildStopService([liveEgress(EgressStatus.EGRESS_ACTIVE)]);
		Object.assign((service as unknown as { livekitService: object }).livekitService, {
			stopEgressIfRunning: async () => null
		});
		Object.assign(service, { recordingRepository: { findByRecordingId: async () => null } });

		await expect(service.stopRecording(recordingId)).rejects.toMatchObject({
			statusCode: 409,
			message: errorRecordingAlreadyStopped(recordingId).message
		});
	});

	it('answers 409 while another stop of the room holds its stop lock', async () => {
		const { service } = buildStopService([]);
		Object.assign(service, { mutexService: { withLock: async () => null } });

		await expect(service.stopRecording(recordingId)).rejects.toMatchObject({
			statusCode: 409,
			message: errorRecordingStopInProgress(recordingId).message
		});
	});

	it('answers 404 for a recording that does not exist', async () => {
		const { service } = buildStopService([]);
		Object.assign(service, { recordingRepository: { findByRecordingId: async () => null } });

		await expect(service.getRecording(recordingId)).rejects.toMatchObject({ statusCode: 404 });
	});

	it('answers 409 for a recording whose egress has ended', async () => {
		const { service, stopped } = buildStopService([{ status: EgressStatus.EGRESS_COMPLETE }]);

		await expect(service.stopRecording(recordingId)).rejects.toMatchObject({ statusCode: 409 });
		expect(stopped).toEqual([]);
	});
});

describe('RecordingService.writeRecordingsZip', () => {
	const recordingIds = Array.from({ length: 60 }, (_, index) => `room-1--EG_${index}--abc`);

	const buildZipService = (openStream: () => Readable) => {
		const service = buildService(new FakeLiveKitService([]), new FakeMutexService());
		Object.assign(service, {
			getRecording: async (recordingId: string) => ({ filename: `${recordingId}.mp4` }),
			getRecordingAsStream: async () => ({ fileSize: undefined, fileStream: openStream() })
		});
		return service;
	};

	const drainedOutput = () => {
		const chunks: Buffer[] = [];
		const output = new PassThrough();
		output.on('data', (chunk: Buffer) => chunks.push(chunk));
		return { output, zipEntries: () => Buffer.concat(chunks).toString('latin1').split('PK\x03\x04').length - 1 };
	};

	it('writes every recording while holding at most one of them open', async () => {
		const opened: Readable[] = [];
		let mostOpenAtOnce = 0;
		const service = buildZipService(() => {
			const stillOpen = opened.filter((stream) => !stream.readableEnded && !stream.destroyed).length;
			mostOpenAtOnce = Math.max(mostOpenAtOnce, stillOpen + 1);
			const stream = Readable.from([Buffer.alloc(1024)]);
			opened.push(stream);
			return stream;
		});
		const { output, zipEntries } = drainedOutput();

		await service.writeRecordingsZip(recordingIds, output, new AbortController().signal);

		expect(opened).toHaveLength(60);
		expect(mostOpenAtOnce).toBe(1);
		expect(zipEntries()).toBe(60);
	});

	it('leaves out a recording it cannot open and names a recording without a filename after its id', async () => {
		const service = buildZipService(() => Readable.from([Buffer.alloc(16)]));
		Object.assign(service, {
			getRecording: async (recordingId: string) => {
				if (recordingId === 'room-1--EG_1--abc') throw new Error('not found');

				return { filename: '' };
			}
		});
		const chunks: Buffer[] = [];
		const output = new PassThrough();
		output.on('data', (chunk: Buffer) => chunks.push(chunk));

		await service.writeRecordingsZip(
			['room-1--EG_0--abc', 'room-1--EG_1--abc'],
			output,
			new AbortController().signal
		);

		const zip = Buffer.concat(chunks).toString('latin1');
		expect(zip.split('PK\x03\x04').length - 1).toBe(1);
		expect(zip).toContain('room-1--EG_0--abc.mp4');
		expect(zip).not.toContain('room-1--EG_1--abc');
	});

	it('destroys the recording being read and opens no other when the download is aborted', async () => {
		const opened: Readable[] = [];
		let firstOpened!: () => void;
		const opening = new Promise<void>((resolve) => (firstOpened = resolve));
		const service = buildZipService(() => {
			const neverEnding = new Readable({ read: () => {} });
			opened.push(neverEnding);
			firstOpened();
			return neverEnding;
		});
		const download = new AbortController();

		const writing = service.writeRecordingsZip(recordingIds, drainedOutput().output, download.signal);
		await opening;
		download.abort();

		await expect(writing).rejects.toMatchObject({ name: 'AbortError' });
		expect(opened).toHaveLength(1);
		expect(opened[0].destroyed).toBe(true);
	});
});

describe('RecordingService.deleteAllRoomRecordings', () => {
	const build = (inProgress: EgressInfo[], storedRecordings: string[]) => {
		const actions: string[] = [];
		const service = new RecordingService(
			...([
				{
					getInProgressRecordingsEgress: async () => inProgress,
					stopEgressIfRunning: async (egressId: string) => actions.push(`stop:${egressId}`)
				},
				{},
				{
					findByRecordingId: async (recordingId: string) => ({
						recordingId,
						roomId: 'room-1',
						status: MeetRecordingStatus.ACTIVE
					}),
					findAllByRoomId: async () => storedRecordings.map((recordingId) => ({ recordingId })),
					deleteByRecordingIds: async (ids: string[]) => actions.push(`deleteDocs:${ids.join(',')}`)
				},
				{},
				{ deleteRecordingMediaBatch: async (ids: string[]) => actions.push(`deleteMedia:${ids.join(',')}`) },
				{},
				{},
				{},
				noopLogger
			] as unknown as ConstructorParameters<typeof RecordingService>)
		);
		Object.assign(service, {
			finishRecording: async (recording: MeetRecordingInfo) => {
				actions.push(`finish:${recording.recordingId}:${recording.status}`);
				return true;
			}
		});
		return { service, actions };
	};

	afterEach(() => {
		jest.useRealTimers();
	});

	it('stops a recording still in progress and ends it as aborted before deleting every recording of the room', async () => {
		jest.useFakeTimers();
		const { service, actions } = build([recordingEgress(EgressStatus.EGRESS_ACTIVE)], [RECORDING_ID, 'room-1--EG_0--old']);

		const deletion = service.deleteAllRoomRecordings('room-1');
		await jest.advanceTimersByTimeAsync(1000);
		await deletion;

		expect(actions).toEqual([
			'stop:EG_1',
			`finish:${RECORDING_ID}:${MeetRecordingStatus.ABORTED}`,
			`deleteDocs:${RECORDING_ID},room-1--EG_0--old`,
			`deleteMedia:${RECORDING_ID},room-1--EG_0--old`
		]);
	});

	it('still deletes the recordings when stopping one in progress fails', async () => {
		jest.useFakeTimers();
		const { service, actions } = build([recordingEgress(EgressStatus.EGRESS_ACTIVE)], [RECORDING_ID]);
		Object.assign((service as unknown as { livekitService: object }).livekitService, {
			stopEgressIfRunning: async () => Promise.reject(new Error('egress unreachable'))
		});

		await service.deleteAllRoomRecordings('room-1');

		expect(actions).toEqual([`deleteDocs:${RECORDING_ID}`, `deleteMedia:${RECORDING_ID}`]);
	});

	it('deletes nothing in a room without recordings', async () => {
		const { service, actions } = build([], []);

		await service.deleteAllRoomRecordings('room-1');

		expect(actions).toEqual([]);
	});
});
