import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Lock } from '@sesamecare-oss/redlock';
import { SpiedFunction } from 'jest-mock';
import { EgressInfo, Room } from 'livekit-server-sdk';
import ms from 'ms';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetLock } from '../../../../src/helpers/redis.helper.js';
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
	let getLocksByPrefixMock: SpiedFunction<(pattern: string) => Promise<Lock[]>>;
	let lockExistsMock: SpiedFunction<(key: string) => Promise<boolean>>;
	let getLockCreatedAtMock: SpiedFunction<(key: string) => Promise<number | null>>;
	let releaseMock: SpiedFunction<(key: string) => Promise<void>>;
	let roomExistsMock: SpiedFunction<(roomName: string) => Promise<boolean>>;
	let getRoomMock: SpiedFunction<(roomName: string) => Promise<Room>>;
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
		getLocksByPrefixMock = jest.spyOn(mutexService, 'getLocksByPrefix');
		lockExistsMock = jest.spyOn(mutexService, 'lockExists');
		getLockCreatedAtMock = jest.spyOn(mutexService, 'getLockCreatedAt');
		releaseMock = jest.spyOn(mutexService, 'release');
		roomExistsMock = jest.spyOn(livekitService, 'roomExists');
		getRoomMock = jest.spyOn(livekitService, 'getRoom');
		getInProgressRecordingsEgressMock = jest.spyOn(livekitService, 'getInProgressRecordingsEgress');
		evaluateAndReleaseOrphanedLockMock = jest.spyOn(
			recordingTaskScheduler as never,
			'evaluateAndReleaseOrphanedLock'
		);

		// Default mock implementations
		releaseMock.mockResolvedValue();
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('performActiveRecordingLocksGC', () => {
		it('should not process any locks when the system has no active recording locks', async () => {
			// Simulate empty response from lock service
			getLocksByPrefixMock.mockResolvedValueOnce([]);

			// Execute the garbage collector
			await recordingTaskScheduler['performActiveRecordingLocksGC']();

			// Verify that we checked for locks but didn't attempt to process any
			expect(getLocksByPrefixMock).toHaveBeenCalled();
			expect(evaluateAndReleaseOrphanedLockMock).not.toHaveBeenCalled();
		});

		it('should gracefully handle database errors during lock retrieval', async () => {
			// Simulate database connection failure or other error
			getLocksByPrefixMock.mockRejectedValueOnce(new Error('Failed to retrieve locks'));

			// Execute the garbage collector - should not throw
			await recordingTaskScheduler['performActiveRecordingLocksGC']();

			// Verify the error was handled properly without further processing
			expect(getLocksByPrefixMock).toHaveBeenCalled();
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
			getLocksByPrefixMock.mockResolvedValueOnce(
				testLockResources.map((resource) => ({ resources: [resource] }) as Lock)
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
			expect(roomExistsMock).not.toHaveBeenCalled();
			expect(releaseMock).not.toHaveBeenCalled();
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
			expect(roomExistsMock).not.toHaveBeenCalled();
			expect(releaseMock).not.toHaveBeenCalled();
		});

		it('should release lock for a room with no publishers and no active recordings', async () => {
			const roomId = 'test-room';

			// Simulate lock exists and is old enough
			lockExistsMock.mockResolvedValue(true);
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - ms('5m')); // 5 minutes old

			// Configure specific mocks for this test
			roomExistsMock.mockResolvedValueOnce(true);
			getRoomMock.mockResolvedValueOnce({
				numPublishers: 0
			} as Room);
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([]);

			// Execute evaluateAndReleaseOrphanedLock
			await recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_');

			// Check that release was called with correct lock name
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);
			expect(getRoomMock).toHaveBeenCalledWith(roomId);
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(releaseMock).toHaveBeenCalledWith(`prefix_${roomId}`);
		});

		it('should release the lock for a room with active recordings and lack of publishers', async () => {
			const roomId = 'test-room';

			// Simulate lock exists and is old enough
			lockExistsMock.mockResolvedValue(true);
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - ms('5m')); // 5 minutes ago

			// Configure specific mocks for this test
			roomExistsMock.mockResolvedValue(true);
			getRoomMock.mockResolvedValue({
				numPublishers: 0
			} as Room);
			getInProgressRecordingsEgressMock.mockResolvedValue([{} as EgressInfo]);

			// Execute evaluateAndReleaseOrphanedLock
			await recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_');

			// Check that release was called with correct lock name
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);
			expect(getRoomMock).toHaveBeenCalledWith(roomId);
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(releaseMock).toHaveBeenCalledWith(`prefix_${roomId}`);
		});

		it('should keep lock for a room with active recordings and with publishers', async () => {
			const roomId = 'test-room';

			// Simulate lock exists and is old enough
			lockExistsMock.mockResolvedValueOnce(true);
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - ms('5m'));

			// Configure specific mocks for this test
			roomExistsMock.mockResolvedValueOnce(true);
			getRoomMock.mockResolvedValueOnce({
				numPublishers: 1
			} as Room);
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([{} as EgressInfo]);

			// Execute evaluateAndReleaseOrphanedLock
			await recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_');

			// Verify lock is kept (release not called)
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);
			expect(getRoomMock).toHaveBeenCalledWith(roomId);
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(releaseMock).not.toHaveBeenCalled();
		});

		it('should release the lock for a non-existent room with active recordings', async () => {
			const roomId = 'test-room';

			// Simulate lock exists and is old enough
			lockExistsMock.mockResolvedValue(true);
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - ms('5m'));

			// Configure specific mocks for this test
			roomExistsMock.mockResolvedValueOnce(false);
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([{} as EgressInfo]);

			// Execute evaluateAndReleaseOrphanedLock
			await recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_');

			// Check that release was called with correct lock name
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);
			expect(getRoomMock).not.toHaveBeenCalled(); // Room doesn't exist
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(releaseMock).toHaveBeenCalledWith(`prefix_${roomId}`);
		});

		it('should release lock for a non-existent room with no active recordings', async () => {
			const roomId = 'test-room';

			// Simulate lock exists and is old enough
			lockExistsMock.mockResolvedValue(true);
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - ms('5m'));

			// Configure specific mocks for this test
			roomExistsMock.mockResolvedValueOnce(false);
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([]);

			// Execute evaluateAndReleaseOrphanedLock
			await recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_');

			// Check that release was called with correct lock name
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);
			expect(getRoomMock).not.toHaveBeenCalled(); // Room doesn't exist
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(releaseMock).toHaveBeenCalledWith(`prefix_${roomId}`);
		});

		it('should handle errors during room existence check', async () => {
			const roomId = 'test-room';

			// Simulate lock exists and is old enough
			lockExistsMock.mockResolvedValueOnce(true);
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - ms('5m'));

			// Simulate error during roomExists check
			roomExistsMock.mockRejectedValueOnce(new Error('Failed to check room'));
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([]);

			// Execute evaluateAndReleaseOrphanedLock and expect error to propagate
			await expect(recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_')).rejects.toThrow(
				'Failed to check room'
			);

			// Verify that process stopped at roomExists
			expect(getRoomMock).not.toHaveBeenCalled();
			expect(releaseMock).not.toHaveBeenCalled();
		});

		it('should handle errors during lock release', async () => {
			const roomId = 'test-room';

			// Simulate lock exists and is old enough
			lockExistsMock.mockResolvedValue(true);
			getLockCreatedAtMock.mockResolvedValueOnce(Date.now() - ms('5m'));

			// Configure specific mocks for this test
			roomExistsMock.mockResolvedValueOnce(false);
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([]);

			// Simulate error during release
			releaseMock.mockRejectedValueOnce(new Error('Failed to release lock'));

			// Execute evaluateAndReleaseOrphanedLock and expect error to propagate
			await expect(recordingTaskScheduler['evaluateAndReleaseOrphanedLock'](roomId, 'prefix_')).rejects.toThrow(
				'Failed to release lock'
			);
		});
	});
});
