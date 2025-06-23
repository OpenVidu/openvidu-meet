import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EgressInfo, EgressStatus, Room } from 'livekit-server-sdk';
import ms from 'ms';
import { Lock } from '@sesamecare-oss/redlock';
import { container } from '../../../../src/config/index.js';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MeetLock } from '../../../../src/helpers/index.js';
import {
	LiveKitService,
	LoggerService,
	MutexService,
	RecordingService,
	RedisLock
} from '../../../../src/services/index.js';
import { startTestServer } from '../../../helpers/request-helpers.js';

describe('Recording Garbage Collector Tests', () => {
	let recordingService: RecordingService;
	let mutexService: MutexService;
	let livekitService: LiveKitService;

	const getRecordingLock = (roomId: string) => MeetLock.getRecordingActiveLock(roomId);

	const testRooms = {
		recentLock: 'room-recent-lock',
		withPublishers: 'room-with-publishers',
		withoutPublishersWithRecording: 'room-without-publishers-with-recording',
		withoutPublishersNoRecording: 'room-without-publishers-no-recording',
		nonExistentWithRecording: 'room-non-existent-with-recording',
		nonExistentNoRecording: 'room-non-existent-no-recording'
	};

	beforeAll(() => {
		startTestServer();
		recordingService = container.get(RecordingService);
		mutexService = container.get(MutexService);
		livekitService = container.get(LiveKitService);

		// Mute logs for the test
		const logger = container.get(LoggerService);
		jest.spyOn(logger, 'debug').mockImplementation(() => {});
		jest.spyOn(logger, 'verbose').mockImplementation(() => {});
		jest.spyOn(logger, 'info').mockImplementation(() => {});
		jest.spyOn(logger, 'warn').mockImplementation(() => {});
		jest.spyOn(logger, 'error').mockImplementation(() => {});
	});

	beforeEach(async () => {
		// Clean up any existing locks before each test
		for (const roomId of Object.values(testRooms)) {
			try {
				await mutexService.release(getRecordingLock(roomId));
			} catch (e) {
				// Ignore errors if the lock does not exist
			}
		}

		// Setup spies
		jest.spyOn(mutexService, 'getLocksByPrefix');
		jest.spyOn(mutexService, 'lockExists');
		jest.spyOn(mutexService, 'getLockCreatedAt');
		jest.spyOn(mutexService, 'release');
		jest.spyOn(livekitService, 'roomExists');
		jest.spyOn(livekitService, 'getRoom');
		jest.spyOn(livekitService, 'getInProgressRecordingsEgress');
		jest.spyOn(recordingService as never, 'performRecordingLocksGarbageCollection');
		jest.spyOn(recordingService as never, 'evaluateAndReleaseOrphanedLock');

		jest.clearAllMocks();

		// Do not set up global mocks here to improve test isolation
	});

	afterEach(async () => {
		// Clean up all spies and its invocations
		jest.clearAllMocks();
		jest.restoreAllMocks();

		// Explicitly restore the mock behavior for getLockCreatedAt
		if (mutexService.getLockCreatedAt && jest.isMockFunction(mutexService.getLockCreatedAt)) {
			(mutexService.getLockCreatedAt as jest.Mock).mockReset();
		}
	});

	afterAll(async () => {
		// Clean up all test locks
		for (const roomId of Object.values(testRooms)) {
			try {
				await mutexService.release(getRecordingLock(roomId));
			} catch (e) {
				// Ignore errors if the lock does not exist
			}
		}

		// Restore all mocks
		jest.restoreAllMocks();
	});

	/**
	 * Creates a test lock with a specified age
	 */
	async function createTestLock(roomId: string, ageMs = 0): Promise<Lock | null> {
		const lockName = getRecordingLock(roomId);
		const lock = await mutexService.acquire(lockName, ms(INTERNAL_CONFIG.RECORDING_LOCK_TTL));

		if (ageMs > 0) {
			// Mock getLockCreatedAt to simulate lock age
			(mutexService.getLockCreatedAt as jest.Mock).mockImplementationOnce((...args) => {
				const lockKey = args[0] as string;

				if (lockKey === lockName) {
					return Date.now() - ageMs;
				}

				return Date.now(); // Default for other locks
			});
		}

		return lock;
	}

	describe('Perform Recording Locks Garbage Collection', () => {
		it('should not process any locks when the system has no active recording locks', async () => {
			// Simulate empty response from lock service
			(mutexService.getLocksByPrefix as jest.Mock).mockResolvedValueOnce([] as never);

			// Execute the garbage collector
			await recordingService['performRecordingLocksGarbageCollection']();

			// Verify that we checked for locks but didn't attempt to process any
			expect(mutexService.getLocksByPrefix).toHaveBeenCalled();
			expect((recordingService as any).evaluateAndReleaseOrphanedLock).not.toHaveBeenCalled();
		});

		it('should gracefully handle database errors during lock retrieval', async () => {
			// Simulate database connection failure or other error
			(mutexService.getLocksByPrefix as jest.Mock).mockRejectedValueOnce(
				new Error('Failed to retrieve locks') as never
			);

			// Execute the garbage collector - should not throw
			await recordingService['performRecordingLocksGarbageCollection']();

			// Verify the error was handled properly without further processing
			expect(mutexService.getLocksByPrefix).toHaveBeenCalled();
			expect((recordingService as any).evaluateAndReleaseOrphanedLock).not.toHaveBeenCalled();
		});

		it('should process each recording lock to detect and clean orphaned resources', async () => {
			// Create mock locks representing different recording scenarios
			const testLockResources = [
				getRecordingLock(testRooms.withPublishers),
				getRecordingLock(testRooms.withoutPublishersNoRecording),
				getRecordingLock(testRooms.nonExistentNoRecording)
			];

			// Simulate existing locks in the system
			(mutexService.getLocksByPrefix as jest.Mock).mockResolvedValueOnce(
				testLockResources.map((resource) => ({ resources: [resource] }) as RedisLock) as never
			);

			// Execute the garbage collector
			await recordingService['performRecordingLocksGarbageCollection']();

			// Verify that each lock was processed individually
			expect((recordingService as any).evaluateAndReleaseOrphanedLock).toHaveBeenCalledTimes(3);
			expect((recordingService as any).evaluateAndReleaseOrphanedLock).toHaveBeenCalledWith(
				testRooms.withPublishers,
				expect.any(String)
			);
			expect((recordingService as any).evaluateAndReleaseOrphanedLock).toHaveBeenCalledWith(
				testRooms.withoutPublishersNoRecording,
				expect.any(String)
			);
			expect((recordingService as any).evaluateAndReleaseOrphanedLock).toHaveBeenCalledWith(
				testRooms.nonExistentNoRecording,
				expect.any(String)
			);
		});
	});

	describe('Evaluate and Release Orphaned Lock', () => {
		it('should skip processing if the lock no longer exists', async () => {
			// Simulate lock does not exist
			(mutexService.lockExists as jest.Mock).mockResolvedValueOnce(false as never);

			// Execute evaluateAndReleaseOrphanedLock
			await recordingService['evaluateAndReleaseOrphanedLock'](testRooms.withPublishers, 'prefix_');

			// Verify that no further checks were performed
			expect(mutexService.getLockCreatedAt).not.toHaveBeenCalled();
			expect(livekitService.roomExists).not.toHaveBeenCalled();
			expect(mutexService.release).not.toHaveBeenCalled();
		});

		it('should skip processing if the lock is too recent', async () => {
			// Simulate lock exists
			(mutexService.lockExists as jest.Mock).mockResolvedValueOnce(true as never);

			// Simulate lock is recent (30 seconds old)
			(mutexService.getLockCreatedAt as jest.Mock).mockResolvedValueOnce((Date.now() - 30000) as never);

			// Execute evaluateAndReleaseOrphanedLock
			await recordingService['evaluateAndReleaseOrphanedLock'](testRooms.recentLock, 'prefix_');

			// Verify that lock age was checked but no further processing occurred
			expect(mutexService.getLockCreatedAt).toHaveBeenCalled();
			expect(livekitService.roomExists).not.toHaveBeenCalled();
			expect(mutexService.release).not.toHaveBeenCalled();
		});

		it('should release lock for a room with no publishers and no active recordings', async () => {
			// Simulate lock exists and is old enough
			(mutexService.lockExists as jest.Mock).mockResolvedValueOnce(true as never);
			(mutexService.getLockCreatedAt as jest.Mock).mockResolvedValueOnce((Date.now() - ms('5m')) as never); // 5 minutes old

			// Configure mocks específicos para este test
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(true as never);
			(livekitService.getRoom as jest.Mock).mockResolvedValueOnce({
				numParticipants: 0,
				numPublishers: 0
			} as Room as never);
			(livekitService.getInProgressRecordingsEgress as jest.Mock).mockResolvedValueOnce([] as never);

			// Create actual test lock
			await createTestLock(testRooms.withoutPublishersNoRecording, ms('5m'));

			// Execute evaluateAndReleaseOrphanedLock
			await recordingService['evaluateAndReleaseOrphanedLock'](
				testRooms.withoutPublishersNoRecording,
				getRecordingLock(testRooms.withoutPublishersNoRecording).replace(/[^:]+$/, '')
			);

			// Check that release was called with correct lock name
			expect(livekitService.roomExists).toHaveBeenCalledWith(testRooms.withoutPublishersNoRecording);
			expect(livekitService.getRoom).toHaveBeenCalledWith(testRooms.withoutPublishersNoRecording);
			expect(livekitService.getInProgressRecordingsEgress).toHaveBeenCalledWith(
				testRooms.withoutPublishersNoRecording
			);
			expect(mutexService.release).toHaveBeenCalled();
		});

		it('should keep lock for a room with active recordings regardless of publishers', async () => {
			// Simulate lock exists and is old enough
			(mutexService.lockExists as jest.Mock).mockResolvedValueOnce(true as never);
			(mutexService.getLockCreatedAt as jest.Mock).mockResolvedValueOnce((Date.now() - ms('5m')) as never);

			// Configure mocks específicos para este test
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(true as never);
			(livekitService.getRoom as jest.Mock).mockResolvedValueOnce({
				numParticipants: 0,
				numPublishers: 0
			} as Room as never);
			(livekitService.getInProgressRecordingsEgress as jest.Mock).mockResolvedValueOnce([
				{
					egressId: `EG_${testRooms.withoutPublishersWithRecording}`,
					status: EgressStatus.EGRESS_ACTIVE
				} as EgressInfo
			] as never);

			// Create actual test lock
			await createTestLock(testRooms.withoutPublishersWithRecording, ms('5m'));

			// Execute evaluateAndReleaseOrphanedLock
			await recordingService['evaluateAndReleaseOrphanedLock'](
				testRooms.withoutPublishersWithRecording,
				getRecordingLock(testRooms.withoutPublishersWithRecording).replace(/[^:]+$/, '')
			);

			// Verify lock is kept (release not called)
			expect(livekitService.roomExists).toHaveBeenCalledWith(testRooms.withoutPublishersWithRecording);
			expect(livekitService.getRoom).toHaveBeenCalledWith(testRooms.withoutPublishersWithRecording);
			expect(livekitService.getInProgressRecordingsEgress).toHaveBeenCalledWith(
				testRooms.withoutPublishersWithRecording
			);
			expect(mutexService.release).not.toHaveBeenCalled();
		});

		it('should keep lock for a non-existent room with active recordings', async () => {
			// Simulate lock exists and is old enough
			(mutexService.lockExists as jest.Mock).mockResolvedValueOnce(true as never);
			(mutexService.getLockCreatedAt as jest.Mock).mockResolvedValueOnce((Date.now() - ms('5m')) as never);

			// Configure mocks específicos para este test
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(false as never);
			(livekitService.getInProgressRecordingsEgress as jest.Mock).mockResolvedValueOnce([
				{
					egressId: `EG_${testRooms.nonExistentWithRecording}`,
					status: EgressStatus.EGRESS_ACTIVE
				} as EgressInfo
			] as never);

			// Create actual test lock
			await createTestLock(testRooms.nonExistentWithRecording, ms('5m'));

			// Execute evaluateAndReleaseOrphanedLock
			await recordingService['evaluateAndReleaseOrphanedLock'](
				testRooms.nonExistentWithRecording,
				getRecordingLock(testRooms.nonExistentWithRecording).replace(/[^:]+$/, '')
			);

			// Verify lock is kept despite room not existing
			expect(livekitService.roomExists).toHaveBeenCalledWith(testRooms.nonExistentWithRecording);
			expect(livekitService.getRoom).not.toHaveBeenCalled(); // Room doesn't exist
			expect(livekitService.getInProgressRecordingsEgress).toHaveBeenCalledWith(
				testRooms.nonExistentWithRecording
			);
			expect(mutexService.release).not.toHaveBeenCalled();
		});

		it('should release lock for a non-existent room with no active recordings', async () => {
			// Simulate lock exists and is old enough
			(mutexService.lockExists as jest.Mock).mockResolvedValueOnce(true as never);
			(mutexService.getLockCreatedAt as jest.Mock).mockResolvedValueOnce((Date.now() - ms('5m')) as never);

			// Configure mocks específicos para este test
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(false as never);
			(livekitService.getInProgressRecordingsEgress as jest.Mock).mockResolvedValueOnce([] as never);

			// Create actual test lock
			await createTestLock(testRooms.nonExistentNoRecording, ms('5m'));

			// Execute evaluateAndReleaseOrphanedLock
			await recordingService['evaluateAndReleaseOrphanedLock'](
				testRooms.nonExistentNoRecording,
				getRecordingLock(testRooms.nonExistentNoRecording).replace(/[^:]+$/, '')
			);

			// Verify lock is released for non-existent room with no recordings
			expect(livekitService.roomExists).toHaveBeenCalledWith(testRooms.nonExistentNoRecording);
			expect(livekitService.getRoom).not.toHaveBeenCalled(); // Room doesn't exist
			expect(livekitService.getInProgressRecordingsEgress).toHaveBeenCalledWith(testRooms.nonExistentNoRecording);
			expect(mutexService.release).toHaveBeenCalled();
		});

		it('should handle errors during room existence check', async () => {
			// Simulate lock exists and is old enough
			(mutexService.lockExists as jest.Mock).mockResolvedValueOnce(true as never);
			(mutexService.getLockCreatedAt as jest.Mock).mockResolvedValueOnce((Date.now() - ms('5m')) as never);

			// Simulate error during roomExists check
			(livekitService.roomExists as jest.Mock).mockRejectedValueOnce(new Error('Failed to check room') as never);

			// Execute evaluateAndReleaseOrphanedLock and expect error to propagate
			await expect(
				recordingService['evaluateAndReleaseOrphanedLock'](testRooms.withPublishers, 'prefix_')
			).rejects.toThrow('Failed to check room');

			// Verify that process stopped at roomExists
			expect(livekitService.getRoom).not.toHaveBeenCalled();
			expect(mutexService.release).not.toHaveBeenCalled();
		});

		it('should handle errors during lock release', async () => {
			// Simulate lock exists and is old enough
			(mutexService.lockExists as jest.Mock).mockResolvedValueOnce(true as never);
			(mutexService.getLockCreatedAt as jest.Mock).mockResolvedValueOnce((Date.now() - ms('5m')) as never);

			// Configure for lock release scenario
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(false as never);
			(livekitService.getInProgressRecordingsEgress as jest.Mock).mockResolvedValueOnce([] as never);

			// Simulate error during release
			(mutexService.release as jest.Mock).mockRejectedValueOnce(new Error('Failed to release lock') as never);

			// Execute evaluateAndReleaseOrphanedLock and expect error to propagate
			await expect(
				recordingService['evaluateAndReleaseOrphanedLock'](testRooms.nonExistentNoRecording, 'prefix_')
			).rejects.toThrow('Failed to release lock');
		});
	});
});
