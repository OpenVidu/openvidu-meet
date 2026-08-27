import { describe, expect, it } from '@jest/globals';
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
