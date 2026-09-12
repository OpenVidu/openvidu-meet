import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { SpiedFunction } from 'jest-mock';
import { EgressInfo, EgressStatus } from 'livekit-server-sdk';
import ms from 'ms';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetLock } from '../../../../src/helpers/redis.helper.js';
import type { RedisLock } from '../../../../src/models/redis-lock.model.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { LoggerService } from '../../../../src/services/logger.service.js';
import { MutexService } from '../../../../src/services/mutex.service.js';
import { RecordingScheduledTasksService } from '../../../../src/services/recording-scheduled-tasks.service.js';
import { startTestServer } from '../../../helpers/request-helpers.js';

describe('Orphaned Active Recording Locks GC Tests', () => {
	let recordingTaskScheduler: RecordingScheduledTasksService;
	let mutexService: MutexService;
	let livekitService: LiveKitService;

	// Mock functions
	let getRegistryLocksByPrefixMock: SpiedFunction<(pattern: string) => Promise<RedisLock[]>>;
	let lockExistsMock: SpiedFunction<(key: string) => Promise<boolean>>;
	let getLockCreatedAtMock: SpiedFunction<(key: string) => Promise<number | null>>;
	let releaseWithRegistryMock: SpiedFunction<(key: string) => Promise<void>>;
	let getInProgressRecordingsEgressMock: SpiedFunction<(roomName?: string) => Promise<EgressInfo[]>>;
	let evaluateAndReleaseOrphanedLockMock: SpiedFunction<(roomId: string, lockPrefix: string) => Promise<void>>;

	beforeAll(async () => {
		await startTestServer();
		recordingTaskScheduler = container.get(RecordingScheduledTasksService);
		mutexService = container.get(MutexService);
		livekitService = container.get(LiveKitService);

		// Mute logs for the test
		const logger = container.get(LoggerService);
		jest.spyOn(logger, 'debug').mockImplementation(() => {});
		jest.spyOn(logger, 'verbose').mockImplementation(() => {});
		jest.spyOn(logger, 'info').mockImplementation(() => {});
		jest.spyOn(logger, 'warn').mockImplementation(() => {});
		jest.spyOn(logger, 'error').mockImplementation(() => {});

		// Setup spies and store mock references
		getRegistryLocksByPrefixMock = jest.spyOn(mutexService, 'getRegistryLocksByPrefix');
		lockExistsMock = jest.spyOn(mutexService, 'lockRegistryExists');
		getLockCreatedAtMock = jest.spyOn(mutexService, 'getLockCreatedAtFromRegistry');
		releaseWithRegistryMock = jest.spyOn(mutexService, 'releaseWithRegistry');
		getInProgressRecordingsEgressMock = jest.spyOn(livekitService, 'getInProgressRecordingsEgress');
		evaluateAndReleaseOrphanedLockMock = jest.spyOn(
			recordingTaskScheduler as never,
			'evaluateAndReleaseOrphanedLock'
		);

		// Default mock implementations
		releaseWithRegistryMock.mockResolvedValue();
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('performActiveRecordingLocksGC', () => {
		it('should not process any locks when the system has no active recording locks', async () => {
			// Simulate empty response from lock service
			getRegistryLocksByPrefixMock.mockResolvedValueOnce([]);

			// Execute the garbage collector
			await recordingTaskScheduler['performActiveRecordingLocksGC']();

			// Verify that we checked for locks but didn't attempt to process any
			expect(getRegistryLocksByPrefixMock).toHaveBeenCalled();
			expect(evaluateAndReleaseOrphanedLockMock).not.toHaveBeenCalled();
		});

		it('should gracefully handle database errors during lock retrieval', async () => {
			// Simulate database connection failure or other error
			getRegistryLocksByPrefixMock.mockRejectedValueOnce(new Error('Failed to retrieve locks'));

			// Execute the garbage collector - should not throw
			await recordingTaskScheduler['performActiveRecordingLocksGC']();

			// Verify the error was handled properly without further processing
			expect(getRegistryLocksByPrefixMock).toHaveBeenCalled();
			expect(evaluateAndReleaseOrphanedLockMock).not.toHaveBeenCalled();
		});

		it('should process each recording lock to detect and clean orphaned resources', async () => {
			// Create mock locks representing different recording scenarios
			const testLockResources = [
				MeetLock.getRecordingActiveLock('room-1'),
				MeetLock.getRecordingActiveLock('room-2'),
				MeetLock.getRecordingActiveLock('room-3')
			];

			// Simulate existing locks in the system
			getRegistryLocksByPrefixMock.mockResolvedValueOnce(
				testLockResources.map((resource) => ({ resources: [resource] }) as RedisLock)
			);

			// Execute the garbage collector
			await recordingTaskScheduler['performActiveRecordingLocksGC']();

			// Verify that each lock was processed individually
			expect(evaluateAndReleaseOrphanedLockMock).toHaveBeenCalledTimes(3);
			expect(evaluateAndReleaseOrphanedLockMock).toHaveBeenCalledWith('room-1', expect.any(String));
			expect(evaluateAndReleaseOrphanedLockMock).toHaveBeenCalledWith('room-2', expect.any(String));
			expect(evaluateAndReleaseOrphanedLockMock).toHaveBeenCalledWith('room-3', expect.any(String));
		});
	});

	describe('evaluateAndReleaseOrphanedLock', () => {
		it('should skip processing if the lock no longer exists', async () => {
			const roomId = 'test-room';

			// Simulate lock does not exist
			lockExistsMock.mockResolvedValueOnce(false);

			// Execute evaluateAndReleaseOrphanedLock
			await recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_');

			const lockKey = `prefix_${roomId}`;
			expect(lockExistsMock).toHaveBeenCalledWith(lockKey);

			// Verify that no further checks were performed
			expect(getLockCreatedAtMock).not.toHaveBeenCalled();
			expect(getInProgressRecordingsEgressMock).not.toHaveBeenCalled();
			expect(releaseWithRegistryMock).not.toHaveBeenCalled();
		});

		it('should skip processing if the lock is too recent', async () => {
			const roomId = 'test-room';

			// Simulate lock exists
			lockExistsMock.mockResolvedValueOnce(true);

			// Simulate lock is recent (20 seconds old)
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - 20000);

			// Execute evaluateAndReleaseOrphanedLock
			await recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_');

			// Verify that lock age was checked but no further processing occurred
			expect(getLockCreatedAtMock).toHaveBeenCalled();
			expect(getInProgressRecordingsEgressMock).not.toHaveBeenCalled();
			expect(releaseWithRegistryMock).not.toHaveBeenCalled();
		});

		it('should release the lock of a room with no in-progress recording egress', async () => {
			const roomId = 'test-room';

			lockExistsMock.mockResolvedValue(true);
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - ms('5m'));
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([]);

			await recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_');

			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(releaseWithRegistryMock).toHaveBeenCalledWith(`prefix_${roomId}`);
		});

		it('should keep the lock while a recording egress is in progress, even with nobody publishing', async () => {
			const roomId = 'test-room';

			lockExistsMock.mockResolvedValueOnce(true);
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - ms('5m'));
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([
				{ status: EgressStatus.EGRESS_STARTING } as EgressInfo
			]);

			await recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_');

			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(releaseWithRegistryMock).not.toHaveBeenCalled();
		});

		it('should handle errors during the egress check', async () => {
			const roomId = 'test-room';

			lockExistsMock.mockResolvedValueOnce(true);
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - ms('5m'));
			getInProgressRecordingsEgressMock.mockRejectedValueOnce(new Error('Failed to list egress'));

			await expect(recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_')).rejects.toThrow(
				'Failed to list egress'
			);

			expect(releaseWithRegistryMock).not.toHaveBeenCalled();
		});

		it('should handle errors during lock release', async () => {
			const roomId = 'test-room';

			// Simulate lock exists and is old enough
			lockExistsMock.mockResolvedValue(true);
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - ms('5m'));
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([]);

			// Simulate error during release
			releaseWithRegistryMock.mockRejectedValueOnce(new Error('Failed to release lock'));

			// Execute evaluateAndReleaseOrphanedLock and expect error to propagate
			await expect(recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_')).rejects.toThrow(
				'Failed to release lock'
			);
		});
	});
});
