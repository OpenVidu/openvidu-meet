import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import { EgressInfo, EgressStatus, Room } from 'livekit-server-sdk';
import ms from 'ms';
import { container } from '../../../../src/config/index.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MeetLock } from '../../../../src/helpers/index.js';
import { LiveKitService, LoggerService, MutexService, RecordingService } from '../../../../src/services/index.js';
import { startTestServer } from '../../../helpers/request-helpers.js';

describe('Recording Cleanup Tests', () => {
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
		nonExistentNoRecording: 'room-non-existent-no-recording',
		staleRecording: 'room-stale-recording',
		freshRecording: 'room-fresh-recording',
		abortedRecording: 'room-aborted-recording',
		noUpdatedAt: 'room-no-updated-at'
	};

	beforeAll(async () => {
		await startTestServer();
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
		jest.spyOn(livekitService, 'stopEgress');
		jest.spyOn(recordingService as never, 'performRecordingLocksGarbageCollection');
		jest.spyOn(recordingService as never, 'evaluateAndReleaseOrphanedLock');
		jest.spyOn(recordingService as never, 'performStaleRecordingsCleanup');
		jest.spyOn(recordingService as never, 'evaluateAndAbortStaleRecording');
		jest.spyOn(recordingService, 'getRecording');
		jest.spyOn(recordingService as never, 'updateRecordingStatus');

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
	 * Creates a mock EgressInfo object for testing
	 */
	function createMockEgressInfo(
		roomId: string,
		egressId: string,
		status: EgressStatus,
		updatedAt?: number
	): EgressInfo {
		const uid = '1234567890';
		return {
			egressId,
			roomId,
			roomName: roomId,
			status,
			updatedAt: updatedAt ? BigInt(updatedAt * 1_000_000) : undefined, // Convert to nanoseconds
			startedAt: BigInt(Date.now() * 1_000_000),
			endedAt: status === EgressStatus.EGRESS_COMPLETE ? BigInt(Date.now() * 1_000_000) : undefined,
			fileResults: [
				{
					filename: `${roomId}--${uid}.mp4`,
					size: BigInt(1024 * 1024), // 1MB
					duration: BigInt(60 * 1_000_000_000) // 60 seconds in nanoseconds
				}
			],
			streamResults: [],
			request: {
				case: 'roomComposite'
			}
		} as unknown as EgressInfo;
	}

	/**
	 * Creates a mock MeetRecordingInfo object for testing
	 */
	function createMockRecordingInfo(
		recordingId: string,
		roomId: string,
		status: MeetRecordingStatus
	): MeetRecordingInfo {
		return {
			recordingId,
			roomId,
			roomName: roomId,
			status,
			startDate: Date.now() - ms('10m'),
			filename: `${recordingId}.mp4`
		};
	}

	describe('Perform Stale Recordings Cleanup', () => {
		it('should not process any recordings when there are no in-progress recordings', async () => {
			// Simulate empty response from LiveKit
			(livekitService.getInProgressRecordingsEgress as jest.Mock).mockResolvedValueOnce([] as never);

			// Execute the stale recordings cleanup
			await recordingService['performStaleRecordingsCleanup']();

			// Verify that we checked for recordings but didn't attempt to process any
			expect(livekitService.getInProgressRecordingsEgress).toHaveBeenCalled();
			expect((recordingService as never)['evaluateAndAbortStaleRecording']).not.toHaveBeenCalled();
		});

		it('should gracefully handle errors during in-progress recordings retrieval', async () => {
			// Simulate LiveKit service failure
			(livekitService.getInProgressRecordingsEgress as jest.Mock).mockRejectedValueOnce(
				new Error('Failed to retrieve recordings') as never
			);

			// Execute the stale recordings cleanup - should not throw
			await recordingService['performStaleRecordingsCleanup']();

			// Verify the error was handled properly without further processing
			expect(livekitService.getInProgressRecordingsEgress).toHaveBeenCalled();
			expect((recordingService as never)['evaluateAndAbortStaleRecording']).not.toHaveBeenCalled();
		});

		it('should process each in-progress recording to detect and abort stale ones', async () => {
			const roomIds = [testRooms.staleRecording, testRooms.freshRecording, testRooms.abortedRecording];
			const mockEgressInfos = roomIds.map((roomId) =>
				createMockEgressInfo(roomId, `EG_${roomId}`, EgressStatus.EGRESS_ACTIVE)
			);

			// Simulate existing in-progress recordings in the system
			(livekitService.getInProgressRecordingsEgress as jest.Mock).mockResolvedValueOnce(mockEgressInfos as never);

			// Execute the stale recordings cleanup
			await recordingService['performStaleRecordingsCleanup']();

			// Verify that each recording was processed individually
			expect((recordingService as never)['evaluateAndAbortStaleRecording']).toHaveBeenCalledTimes(3);
			mockEgressInfos.forEach((egressInfo) => {
				expect((recordingService as never)['evaluateAndAbortStaleRecording']).toHaveBeenCalledWith(egressInfo);
			});
		});
	});

	describe('Evaluate and Abort Stale Recording', () => {
		it('should skip processing if the recording is already aborted', async () => {
			const roomId = testRooms.abortedRecording;
			const egressId = `EG_${roomId}`;
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE);

			// Mock recording as already aborted
			const mockRecordingInfo = createMockRecordingInfo(
				`${roomId}--${egressId}--1234567890`,
				roomId,
				MeetRecordingStatus.ABORTED
			);
			(recordingService.getRecording as jest.Mock).mockResolvedValueOnce(mockRecordingInfo as never);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingService['evaluateAndAbortStaleRecording'](egressInfo);

			// Verify that the method returned true (already aborted)
			expect(result).toBe(true);
			expect(recordingService.getRecording).toHaveBeenCalled();
			expect(livekitService.roomExists).not.toHaveBeenCalled();
			expect(recordingService['updateRecordingStatus']).not.toHaveBeenCalled();
			expect(livekitService.stopEgress).not.toHaveBeenCalled();
		});

		it('should skip processing if the recording has no updatedAt timestamp', async () => {
			const roomId = testRooms.noUpdatedAt;
			const egressId = `EG_${roomId}`;
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE); // No updatedAt

			// Mock recording as active
			const mockRecordingInfo = createMockRecordingInfo(
				`${roomId}--${egressId}--1234567890`,
				roomId,
				MeetRecordingStatus.ACTIVE
			);
			(recordingService.getRecording as jest.Mock).mockResolvedValueOnce(mockRecordingInfo as never);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingService['evaluateAndAbortStaleRecording'](egressInfo);

			// Verify that the method returned false (kept as fresh)
			expect(result).toBe(false);
			expect(recordingService.getRecording).toHaveBeenCalled();
			expect(livekitService.roomExists).not.toHaveBeenCalled();
			expect(recordingService['updateRecordingStatus']).not.toHaveBeenCalled();
			expect(livekitService.stopEgress).not.toHaveBeenCalled();
		});

		it('should keep recording as fresh if it has been updated recently', async () => {
			const roomId = testRooms.freshRecording;
			const egressId = `EG_${roomId}`;
			const recentUpdateTime = Date.now() - ms('1m'); // 1 minute ago (fresh)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, recentUpdateTime);

			// Mock recording as active
			const mockRecordingInfo = createMockRecordingInfo(
				`${roomId}--${egressId}--1234567890`,
				roomId,
				MeetRecordingStatus.ACTIVE
			);
			(recordingService.getRecording as jest.Mock).mockResolvedValueOnce(mockRecordingInfo as never);
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(true as never);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingService['evaluateAndAbortStaleRecording'](egressInfo);

			// Verify that the method returned false (still fresh)
			expect(result).toBe(false);
			expect(recordingService.getRecording).toHaveBeenCalled();
			expect(livekitService.roomExists).toHaveBeenCalledWith(roomId);
			expect(livekitService.stopEgress).not.toHaveBeenCalled();
			expect(recordingService['updateRecordingStatus']).not.toHaveBeenCalled();
		});

		it('should abort recording if room does not exist and recording updated time is stale', async () => {
			const roomId = testRooms.staleRecording;
			const egressId = `EG_${roomId}`;
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const staleUpdateTime = Date.now() - ms('10m'); // 10 minutes ago (stale)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime);

			// Mock recording as active
			const mockRecordingInfo = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			(recordingService.getRecording as jest.Mock).mockResolvedValueOnce(mockRecordingInfo as never);
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(false as never);
			(livekitService.stopEgress as jest.Mock).mockResolvedValueOnce({} as never);
			((recordingService as never)['updateRecordingStatus'] as jest.Mock).mockResolvedValueOnce(
				undefined as never
			);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingService['evaluateAndAbortStaleRecording'](egressInfo);

			// Verify that the recording was aborted
			expect(result).toBe(true);
			expect(recordingService.getRecording).toHaveBeenCalledWith(recordingId);
			expect(livekitService.roomExists).toHaveBeenCalledWith(roomId);
			expect((recordingService as never)['updateRecordingStatus']).toHaveBeenCalledWith(
				recordingId,
				MeetRecordingStatus.ABORTED
			);
			expect(livekitService.stopEgress).toHaveBeenCalledWith(egressId);
		});

		it('should abort recording if room exists with no publishers and updated time is stale', async () => {
			const roomId = testRooms.staleRecording;
			const egressId = `EG_${roomId}`;
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const staleUpdateTime = Date.now() - ms('10m'); // 10 minutes ago (stale)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime);

			// Mock recording as active
			const mockRecordingInfo = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			(recordingService.getRecording as jest.Mock).mockResolvedValue(mockRecordingInfo as never);
			(livekitService.roomExists as jest.Mock).mockResolvedValue(true as never); // Room exists
			(livekitService.getRoom as jest.Mock).mockResolvedValue({
				numParticipants: 0,
				numPublishers: 0
			} as Room as never);
			(livekitService.stopEgress as jest.Mock).mockResolvedValue({} as never);
			((recordingService as never)['updateRecordingStatus'] as jest.Mock).mockResolvedValueOnce(
				undefined as never
			);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingService['evaluateAndAbortStaleRecording'](egressInfo);

			// Verify that the recording was aborted
			expect(result).toBe(true);
			expect(recordingService.getRecording).toHaveBeenCalledWith(recordingId);
			expect(livekitService.roomExists).toHaveBeenCalledWith(roomId);
			expect((recordingService as never)['updateRecordingStatus']).toHaveBeenCalledWith(
				recordingId,
				MeetRecordingStatus.ABORTED
			);
			expect(livekitService.stopEgress).toHaveBeenCalledWith(egressId);
		});

		it('should keep recording if it has been updated recently regardless room existence', async () => {
			const roomId = testRooms.staleRecording;
			const egressId = `EG_${roomId}`;
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, Date.now());

			// Mock recording as active
			const mockRecordingInfo = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			(recordingService.getRecording as jest.Mock).mockResolvedValue(mockRecordingInfo as never);
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(true as never); // Room exists

			// Execute evaluateAndAbortStaleRecording
			let result = await recordingService['evaluateAndAbortStaleRecording'](egressInfo);

			// Verify that the recording was kept fresh (not aborted)
			expect(result).toBe(false);
			expect(recordingService.getRecording).toHaveBeenCalledWith(recordingId);
			expect(livekitService.roomExists).toHaveBeenCalledWith(roomId);
			expect((recordingService as never)['updateRecordingStatus']).not.toHaveBeenCalled();
			expect(livekitService.stopEgress).not.toHaveBeenCalled();

			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(false as never); // Room exists

			// Execute evaluateAndAbortStaleRecording
			result = await recordingService['evaluateAndAbortStaleRecording'](egressInfo);

			// Verify that the recording was kept fresh (not aborted)
			expect(result).toBe(false);
			expect(recordingService.getRecording).toHaveBeenCalledWith(recordingId);
			expect(livekitService.roomExists).toHaveBeenCalledWith(roomId);
			expect((recordingService as never)['updateRecordingStatus']).not.toHaveBeenCalled();
			expect(livekitService.stopEgress).not.toHaveBeenCalled();
		});

		it('should keep recording if room exists with publishers even when updated time is stale', async () => {
			const roomId = testRooms.staleRecording;
			const egressId = `EG_${roomId}`;
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const staleUpdateTime = Date.now() - ms('10m'); // 10 minutes ago (stale)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime);

			// Mock recording as active
			const mockRecordingInfo = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			(recordingService.getRecording as jest.Mock).mockResolvedValueOnce(mockRecordingInfo as never);
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(true as never);
			(livekitService.getRoom as jest.Mock).mockResolvedValueOnce({
				numParticipants: 1,
				numPublishers: 1
			} as Room as never);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingService['evaluateAndAbortStaleRecording'](egressInfo);

			// Verify that the recording was kept fresh (not aborted)
			expect(result).toBe(false);
			expect(recordingService.getRecording).toHaveBeenCalledWith(recordingId);
			expect(livekitService.roomExists).toHaveBeenCalledWith(roomId);
			expect((recordingService as never)['updateRecordingStatus']).not.toHaveBeenCalled();
			expect(livekitService.stopEgress).not.toHaveBeenCalled();
		});

		it('should keep recording if room exists with no publishers but updated time is recent', async () => {
			const roomId = testRooms.staleRecording;
			const egressId = `EG_${roomId}`;
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recentUpdateTime = Date.now() - ms('1m'); // 1 minute ago (recent)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, recentUpdateTime);

			// Mock recording as active
			const mockRecordingInfo = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			(recordingService.getRecording as jest.Mock).mockResolvedValueOnce(mockRecordingInfo as never);
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(true as never);
			(livekitService.getRoom as jest.Mock).mockResolvedValueOnce({
				numParticipants: 1,
				numPublishers: 0
			} as Room as never);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingService['evaluateAndAbortStaleRecording'](egressInfo);

			// Verify that the recording was kept fresh (not aborted)
			expect(result).toBe(false);
			expect(recordingService.getRecording).toHaveBeenCalledWith(recordingId);
			expect(livekitService.roomExists).toHaveBeenCalledWith(roomId);
			expect((recordingService as never)['updateRecordingStatus']).not.toHaveBeenCalled();
			expect(livekitService.stopEgress).not.toHaveBeenCalled();
		});

		it('should keep recording if room exists with publishers and updated time is recent', async () => {
			const roomId = testRooms.staleRecording;
			const egressId = `EG_${roomId}`;
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recentUpdateTime = Date.now() - ms('1m'); // 1 minute ago (recent)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, recentUpdateTime);

			// Mock recording as active
			const mockRecordingInfo = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			(recordingService.getRecording as jest.Mock).mockResolvedValueOnce(mockRecordingInfo as never);
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(true as never);
			(livekitService.getRoom as jest.Mock).mockResolvedValueOnce({
				numParticipants: 1,
				numPublishers: 1
			} as Room as never);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingService['evaluateAndAbortStaleRecording'](egressInfo);

			// Verify that the recording was kept fresh (not aborted)
			expect(result).toBe(false);
			expect(recordingService.getRecording).toHaveBeenCalledWith(recordingId);
			expect(livekitService.roomExists).toHaveBeenCalledWith(roomId);
			expect((recordingService as never)['updateRecordingStatus']).not.toHaveBeenCalled();
			expect(livekitService.stopEgress).not.toHaveBeenCalled();
		});

		it('should handle edge case when updatedAt is exactly on the staleAfterMs threshold', async () => {
			const roomId = testRooms.staleRecording;
			const egressId = `EG_${roomId}`;
			const recordingId = `${roomId}--${egressId}--1234567890`;

			// Use Jest fake timers to precisely control Date.now()
			jest.useFakeTimers();
			const now = 1_000_000;
			jest.setSystemTime(now);
			const staleUpdateTime = now - ms(INTERNAL_CONFIG.RECORDING_STALE_AFTER);
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime);

			// Mock recording as active
			const mockRecordingInfo = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			(recordingService.getRecording as jest.Mock).mockResolvedValueOnce(mockRecordingInfo as never);
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(false as never);
			(livekitService.stopEgress as jest.Mock).mockResolvedValueOnce({} as never);
			((recordingService as never)['updateRecordingStatus'] as jest.Mock).mockResolvedValueOnce(
				undefined as never
			);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingService['evaluateAndAbortStaleRecording'](egressInfo);

			// Verify that the recording was aborted
			expect(result).toBe(false);
			expect(recordingService.getRecording).toHaveBeenCalledWith(recordingId);
			expect(livekitService.roomExists).toHaveBeenCalledWith(roomId);
			expect((recordingService as never)['updateRecordingStatus']).not.toHaveBeenCalled();
			expect(livekitService.stopEgress).not.toHaveBeenCalledWith(egressId);
		});

		it('should handle errors during recording processing and rethrow them', async () => {
			const roomId = testRooms.staleRecording;
			const egressId = `EG_${roomId}`;
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE);

			// Mock error during recording retrieval
			(recordingService.getRecording as jest.Mock).mockRejectedValueOnce(
				new Error('Recording not found in storage') as never
			);

			// Execute evaluateAndAbortStaleRecording and expect error to propagate
			await expect(recordingService['evaluateAndAbortStaleRecording'](egressInfo)).rejects.toThrow(
				'Recording not found in storage'
			);

			expect(recordingService.getRecording).toHaveBeenCalledWith(recordingId);
		});

		it('should handle errors during recording abort and rethrow them', async () => {
			const roomId = testRooms.staleRecording;
			const egressId = `EG_${roomId}`;
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const staleUpdateTime = Date.now() - ms('10m'); // 10 minutes ago (stale)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime);

			// Mock recording as active
			const mockRecordingInfo = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			(recordingService.getRecording as jest.Mock).mockResolvedValueOnce(mockRecordingInfo as never);
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(false as never);
			(livekitService.stopEgress as jest.Mock).mockRejectedValueOnce(new Error('Failed to stop egress') as never);

			// Execute evaluateAndAbortStaleRecording and expect error to propagate
			await expect(recordingService['evaluateAndAbortStaleRecording'](egressInfo)).rejects.toThrow(
				'Failed to stop egress'
			);

			expect(recordingService.getRecording).toHaveBeenCalledWith(recordingId);
			expect(livekitService.roomExists).toHaveBeenCalledWith(roomId);
			expect(livekitService.stopEgress).toHaveBeenCalledWith(egressId);
		});

		it('should handle case where updatedAt is in the future due to clock skew', async () => {
			const roomId = testRooms.staleRecording;
			const egressId = `EG_${roomId}`;
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const staleUpdateTime = Date.now() + ms('10m'); // 10 minutes in the future (not stale)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime);

			// Mock recording as active
			const mockRecordingInfo = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			(recordingService.getRecording as jest.Mock).mockResolvedValueOnce(mockRecordingInfo as never);
			(livekitService.roomExists as jest.Mock).mockResolvedValueOnce(true as never);
			(livekitService.getRoom as jest.Mock).mockResolvedValueOnce({
				numParticipants: 0,
				numPublishers: 0
			} as Room as never);

			// Execute evaluateAndAbortStaleRecording and expect it to resolve to false
			await expect(recordingService['evaluateAndAbortStaleRecording'](egressInfo)).resolves.toBe(false);

			expect(recordingService.getRecording).toHaveBeenCalledWith(recordingId);
			expect(livekitService.roomExists).toHaveBeenCalledWith(roomId);
			expect(livekitService.getRoom).not.toBeCalled();
		});
	});
});
