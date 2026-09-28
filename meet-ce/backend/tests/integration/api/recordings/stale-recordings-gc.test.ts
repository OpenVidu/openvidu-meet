import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
	MeetRecordingEncodingPreset,
	MeetRecordingInfo,
	MeetRecordingLayout,
	MeetRecordingStatus
} from '@openvidu-meet/typings';
import { SpiedFunction } from 'jest-mock';
import { EgressInfo, EgressStatus } from 'livekit-server-sdk';
import ms from 'ms';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { RecordingHelper } from '../../../../src/helpers/recording.helper.js';
import { RecordingRepository } from '../../../../src/repositories/recording.repository.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { LoggerService } from '../../../../src/services/logger.service.js';
import { RecordingScheduledTasksService } from '../../../../src/services/recording-scheduled-tasks.service.js';
import { RecordingService } from '../../../../src/services/recording.service.js';
import { MeetRecordingPage } from '../../../../src/types/recording-projection.types.js';
import { createRoom, deleteAllRecordings, deleteAllRooms, startTestServer } from '../../../helpers/request-helpers.js';

describe('Stale Recordings GC Tests', () => {
	let recordingTaskScheduler: RecordingScheduledTasksService;

	// Mock functions
	let findInProgressRecordingsMock: SpiedFunction<() => Promise<MeetRecordingPage<MeetRecordingInfo>>>;
	let roomExistsMock: SpiedFunction<(roomName: string) => Promise<boolean>>;
	let roomHasParticipantsMock: SpiedFunction<(roomName: string) => Promise<boolean>>;
	let getInProgressRecordingsEgressMock: SpiedFunction<(roomName?: string) => Promise<EgressInfo[]>>;
	let stopEgressMock: SpiedFunction<(egressId: string) => Promise<EgressInfo | undefined>>;
	let evaluateAndAbortStaleRecordingMock: SpiedFunction<(recording: MeetRecordingInfo) => Promise<boolean>>;
	let getEgressMock: SpiedFunction<(roomName?: string, egressId?: string) => Promise<EgressInfo[]>>;
	let finishRecordingMock: SpiedFunction<(recording: MeetRecordingInfo) => Promise<boolean>>;
	let toRecordingInfoMock: SpiedFunction<(egressInfo: EgressInfo) => Promise<MeetRecordingInfo>>;
	let recordingRepository: RecordingRepository;

	beforeAll(async () => {
		await startTestServer();

		const logger = container.get(LoggerService);
		const recordingService = container.get(RecordingService);
		recordingRepository = container.get(RecordingRepository);
		const livekitService = container.get(LiveKitService);
		recordingTaskScheduler = container.get(RecordingScheduledTasksService);

		// Mute logs for the test
		jest.spyOn(logger, 'debug').mockImplementation(() => {});
		jest.spyOn(logger, 'verbose').mockImplementation(() => {});
		jest.spyOn(logger, 'info').mockImplementation(() => {});
		jest.spyOn(logger, 'warn').mockImplementation(() => {});
		jest.spyOn(logger, 'error').mockImplementation(() => {});

		// Setup spies and store mock references
		findInProgressRecordingsMock = jest.spyOn(recordingRepository, 'findInProgressRecordings');
		roomExistsMock = jest.spyOn(livekitService, 'roomExists');
		roomHasParticipantsMock = jest.spyOn(livekitService, 'roomHasParticipants');
		getInProgressRecordingsEgressMock = jest.spyOn(livekitService, 'getInProgressRecordingsEgress');
		stopEgressMock = jest.spyOn(livekitService, 'stopEgressIfRunning');
		evaluateAndAbortStaleRecordingMock = jest.spyOn(
			recordingTaskScheduler as never,
			'evaluateAndAbortStaleRecording'
		);
		getEgressMock = jest.spyOn(livekitService, 'getEgress');
		finishRecordingMock = jest.spyOn(recordingService, 'finishRecording');
		toRecordingInfoMock = jest.spyOn(RecordingHelper, 'toRecordingInfo');

		// Default mock implementations
		getEgressMock.mockResolvedValue([]);
		finishRecordingMock.mockResolvedValue(true);
		stopEgressMock.mockResolvedValue({} as EgressInfo);
	});

	afterEach(() => {
		jest.clearAllMocks();
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

	describe('performStaleRecordingsGC', () => {
		it('should not process any recordings when there are no active recordings in database', async () => {
			// Mock empty response from database
			findInProgressRecordingsMock.mockResolvedValueOnce({
				recordings: [],
				isTruncated: false,
				nextPageToken: undefined
			});

			// Execute the stale recordings cleanup
			await recordingTaskScheduler['performStaleRecordingsGC']();

			// Verify that we checked for recordings but didn't attempt to process any
			expect(findInProgressRecordingsMock).toHaveBeenCalled();
			expect(evaluateAndAbortStaleRecordingMock).not.toHaveBeenCalled();
		});

		it('should gracefully handle errors during active recordings retrieval from database', async () => {
			// Simulate database failure
			findInProgressRecordingsMock.mockRejectedValueOnce(new Error('Failed to retrieve recordings'));

			// Execute the stale recordings cleanup - should not throw
			await recordingTaskScheduler['performStaleRecordingsGC']();

			// Verify the error was handled properly without further processing
			expect(findInProgressRecordingsMock).toHaveBeenCalled();
			expect(evaluateAndAbortStaleRecordingMock).not.toHaveBeenCalled();
		});

		it('should process each active recording from database to detect and abort stale ones', async () => {
			const mockRecordings: MeetRecordingInfo[] = [
				createMockRecordingInfo('room-1--EG_1--uid1', 'room-1', MeetRecordingStatus.ACTIVE),
				createMockRecordingInfo('room-2--EG_2--uid2', 'room-2', MeetRecordingStatus.ACTIVE),
				createMockRecordingInfo('room-3--EG_3--uid3', 'room-3', MeetRecordingStatus.ENDING)
			];

			// Mock database response with active recordings
			findInProgressRecordingsMock.mockResolvedValueOnce({
				recordings: mockRecordings,
				isTruncated: false,
				nextPageToken: undefined
			});

			// Mock that no egress exists for any recording (all stale)
			getInProgressRecordingsEgressMock.mockResolvedValue([]);

			// Execute the stale recordings cleanup
			await recordingTaskScheduler['performStaleRecordingsGC']();

			// Verify that each recording was processed individually
			expect(evaluateAndAbortStaleRecordingMock).toHaveBeenCalledTimes(3);
			mockRecordings.forEach((recording) => {
				expect(evaluateAndAbortStaleRecordingMock).toHaveBeenCalledWith(recording);
			});
		});
	});

	describe('evaluateAndAbortStaleRecording', () => {
		it('should end a recording as aborted, reporting it, when LiveKit no longer knows its egress', async () => {
			const roomId = 'test-room';
			const recordingId = `${roomId}--EG_test--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);

			// Mock no egress found in LiveKit
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([]);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			// Verify that the recording was ended through the reporting path without stopping the egress
			expect(result).toBe(true);
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(getEgressMock).toHaveBeenCalledWith(roomId, 'EG_test');
			expect(finishRecordingMock).toHaveBeenCalledWith({ ...recording, status: MeetRecordingStatus.ABORTED });
			expect(stopEgressMock).not.toHaveBeenCalled();
			expect(roomExistsMock).not.toHaveBeenCalled();
		});

		it('should abort a recording still starting whose egress is gone from LiveKit', async () => {
			const roomId = 'test-room';
			const recordingId = `${roomId}--EG_test--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.STARTING);

			getInProgressRecordingsEgressMock.mockResolvedValueOnce([]);

			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			expect(result).toBe(true);
			expect(finishRecordingMock).toHaveBeenCalledWith({ ...recording, status: MeetRecordingStatus.ABORTED });
			expect(stopEgressMock).not.toHaveBeenCalled();
		});

		it('should end a recording with the status LiveKit reports for its ended egress', async () => {
			const roomId = 'test-room';
			const egressId = 'EG_test';
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ENDING);
			const endedEgress = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_COMPLETE);
			const completed = { ...recording, status: MeetRecordingStatus.COMPLETE };

			getInProgressRecordingsEgressMock.mockResolvedValueOnce([]);
			getEgressMock.mockResolvedValueOnce([endedEgress]);
			toRecordingInfoMock.mockResolvedValueOnce(completed);

			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			expect(result).toBe(true);
			expect(toRecordingInfoMock).toHaveBeenCalledWith(endedEgress);
			expect(finishRecordingMock).toHaveBeenCalledWith(completed);
		});

		it('should leave alone a recording whose egress is in progress again', async () => {
			const roomId = 'test-room';
			const egressId = 'EG_test';
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.STARTING);
			const activeEgress = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE);

			getInProgressRecordingsEgressMock.mockResolvedValueOnce([]);
			getEgressMock.mockResolvedValueOnce([activeEgress]);
			toRecordingInfoMock.mockResolvedValueOnce({ ...recording, status: MeetRecordingStatus.ACTIVE });

			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			expect(result).toBe(false);
			expect(finishRecordingMock).not.toHaveBeenCalled();
		});

		it('should keep a recording waiting for its first track while the room has participants', async () => {
			const roomId = 'test-room';
			const egressId = 'EG_test';
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.STARTING);
			const staleUpdateTime = Date.now() - ms(INTERNAL_CONFIG.RECORDING_STALE_GRACE_PERIOD) - ms('1m');
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_STARTING, staleUpdateTime);

			getInProgressRecordingsEgressMock.mockResolvedValueOnce([egressInfo]);
			roomExistsMock.mockResolvedValueOnce(true);
			roomHasParticipantsMock.mockResolvedValueOnce(true);

			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			expect(result).toBe(false);
			expect(finishRecordingMock).not.toHaveBeenCalled();
			expect(stopEgressMock).not.toHaveBeenCalled();
		});

		it('should skip processing if the recording has no updatedAt timestamp', async () => {
			const roomId = 'test-room';
			const egressId = 'EG_test';
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE); // No updatedAt

			// Mock egress found but without updatedAt
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([egressInfo]);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			// Verify that the method returned false (kept as fresh)
			expect(result).toBe(false);
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(roomExistsMock).not.toHaveBeenCalled();
			expect(finishRecordingMock).not.toHaveBeenCalled();
			expect(stopEgressMock).not.toHaveBeenCalled();
		});

		it('should keep recording as fresh if it has been updated recently', async () => {
			const roomId = 'test-room';
			const egressId = 'EG_test';
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			const recentUpdateTime = Date.now() - ms('1m'); // 1 minute ago (fresh)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, recentUpdateTime);

			// Mock egress found with recent update
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([egressInfo]);
			roomExistsMock.mockResolvedValueOnce(true);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			// Verify that the method returned false (still fresh)
			expect(result).toBe(false);
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);
			expect(stopEgressMock).not.toHaveBeenCalled();
			expect(finishRecordingMock).not.toHaveBeenCalled();
		});

		it('should stop the recording if room does not exist and recording update time is stale', async () => {
			const roomId = 'test-room';
			const egressId = 'EG_test';
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			const staleUpdateTime = Date.now() - ms('10m'); // 10 minutes ago (stale)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime);

			// Mock egress found with stale update and room doesn't exist
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([egressInfo]);
			roomExistsMock.mockResolvedValueOnce(false);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			// Verify that the recording was stopped, its end left to the egress_ended webhook
			expect(result).toBe(true);
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);
			expect(finishRecordingMock).not.toHaveBeenCalled();
			expect(stopEgressMock).toHaveBeenCalledWith(egressId);
		});

		it('should stop the recording if room exists with no participants and updated time is stale', async () => {
			const roomId = 'test-room';
			const egressId = 'EG_test';
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			const staleUpdateTime = Date.now() - ms('10m'); // 10 minutes ago (stale)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime);

			// Mock egress found, room exists but has no participants
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([egressInfo]);
			roomExistsMock.mockResolvedValueOnce(true);
			roomHasParticipantsMock.mockResolvedValueOnce(false);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			// Verify that the recording was stopped, its end left to the egress_ended webhook
			expect(result).toBe(true);
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);
			expect(roomHasParticipantsMock).toHaveBeenCalledWith(roomId);
			expect(finishRecordingMock).not.toHaveBeenCalled();
			expect(stopEgressMock).toHaveBeenCalledWith(egressId);
		});

		it('should keep recording if room exists with participants even when updated time is stale', async () => {
			const roomId = 'test-room';
			const egressId = 'EG_test';
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			const staleUpdateTime = Date.now() - ms('10m'); // 10 minutes ago (stale)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime);

			// Mock egress found, room exists with participants
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([egressInfo]);
			roomExistsMock.mockResolvedValueOnce(true);
			roomHasParticipantsMock.mockResolvedValueOnce(true);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			// Verify that the recording was kept fresh (not aborted)
			expect(result).toBe(false);
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);
			expect(roomHasParticipantsMock).toHaveBeenCalledWith(roomId);
			expect(finishRecordingMock).not.toHaveBeenCalled();
			expect(stopEgressMock).not.toHaveBeenCalled();
		});

		it('should handle edge case when updatedAt is exactly on the staleAfterMs threshold', async () => {
			const roomId = 'test-room';
			const egressId = 'EG_test';
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);

			// Use Jest fake timers to precisely control Date.now()
			jest.useFakeTimers();
			const now = 1_000_000;
			jest.setSystemTime(now);
			const staleUpdateTime = now - ms(INTERNAL_CONFIG.RECORDING_STALE_GRACE_PERIOD);
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime);

			// Mock egress found at exact threshold
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([egressInfo]);
			roomExistsMock.mockResolvedValueOnce(false);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			// Verify that the recording was kept fresh (threshold is not inclusive)
			expect(result).toBe(false);
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);

			jest.useRealTimers();
		});

		it('should handle errors during recording processing and rethrow them', async () => {
			const roomId = 'test-room';
			const recordingId = `${roomId}--EG_test--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);

			// Mock error during egress retrieval
			getInProgressRecordingsEgressMock.mockRejectedValueOnce(new Error('LiveKit service unavailable'));

			// Execute evaluateAndAbortStaleRecording and expect error to propagate
			await expect(recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording)).rejects.toThrow(
				'LiveKit service unavailable'
			);

			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
		});

		it('should handle errors during recording abort and rethrow them', async () => {
			const roomId = 'test-room';
			const egressId = 'EG_test';
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			const staleUpdateTime = Date.now() - ms('10m'); // 10 minutes ago (stale)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime);

			// Mock egress found with stale update and room doesn't exist
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([egressInfo]);
			roomExistsMock.mockResolvedValueOnce(false);
			stopEgressMock.mockRejectedValueOnce(new Error('Failed to stop egress'));

			// Execute evaluateAndAbortStaleRecording and expect error to propagate
			await expect(recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording)).rejects.toThrow(
				'Failed to stop egress'
			);

			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);
			expect(stopEgressMock).toHaveBeenCalledWith(egressId);
		});

		it('should handle case where updatedAt is in the future due to clock skew', async () => {
			const roomId = 'test-room';
			const egressId = 'EG_test';
			const recordingId = `${roomId}--${egressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			const futureUpdateTime = Date.now() + ms('10m'); // 10 minutes in the future (not stale)
			const egressInfo = createMockEgressInfo(roomId, egressId, EgressStatus.EGRESS_ACTIVE, futureUpdateTime);

			// Mock egress found with future timestamp
			getInProgressRecordingsEgressMock.mockResolvedValueOnce([egressInfo]);
			roomExistsMock.mockResolvedValueOnce(true);

			// Execute evaluateAndAbortStaleRecording and expect it to resolve to false
			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			expect(result).toBe(false);
			expect(getInProgressRecordingsEgressMock).toHaveBeenCalledWith(roomId);
			expect(roomExistsMock).toHaveBeenCalledWith(roomId);
			expect(roomHasParticipantsMock).not.toHaveBeenCalled();
		});

		it('should correctly find matching egress when multiple egresses exist for the room', async () => {
			const roomId = 'test-room';
			const targetEgressId = 'EG_target';
			const recordingId = `${roomId}--${targetEgressId}--1234567890`;
			const recording = createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ACTIVE);
			const staleUpdateTime = Date.now() - ms('10m');

			// Mock multiple egresses, only one matches
			const mockEgresses = [
				createMockEgressInfo(roomId, 'EG_other1', EgressStatus.EGRESS_ACTIVE, staleUpdateTime),
				createMockEgressInfo(roomId, targetEgressId, EgressStatus.EGRESS_ACTIVE, staleUpdateTime),
				createMockEgressInfo(roomId, 'EG_other2', EgressStatus.EGRESS_ACTIVE, staleUpdateTime)
			];

			getInProgressRecordingsEgressMock.mockResolvedValueOnce(mockEgresses);
			roomExistsMock.mockResolvedValueOnce(false);

			// Execute evaluateAndAbortStaleRecording
			const result = await recordingTaskScheduler['evaluateAndAbortStaleRecording'](recording);

			// Verify that the correct egress was targeted
			expect(result).toBe(true);
			expect(stopEgressMock).toHaveBeenCalledWith(targetEgressId);
			expect(stopEgressMock).toHaveBeenCalledTimes(1);
		});
	});

	describe('finishing a recording on two replicas', () => {
		afterEach(async () => {
			await deleteAllRecordings();
			await deleteAllRooms();
		});

		it('stores the first final status and refuses the second one', async () => {
			const { roomId } = await createRoom({ roomName: 'stale-gc-race' });
			const recordingId = `${roomId}--EG_race--1234567890`;
			await recordingRepository.create({
				...createMockRecordingInfo(recordingId, roomId, MeetRecordingStatus.ENDING),
				layout: MeetRecordingLayout.GRID,
				encoding: MeetRecordingEncodingPreset.H264_720P_30
			});
			const stored = await recordingRepository.findByRecordingId(recordingId);

			const results = await Promise.all([
				recordingRepository.finish({ ...stored!, status: MeetRecordingStatus.ABORTED }),
				recordingRepository.finish({ ...stored!, status: MeetRecordingStatus.COMPLETE })
			]);
			const winners = results.filter((result) => result !== null);

			expect(winners).toHaveLength(1);
			expect((await recordingRepository.findByRecordingId(recordingId))?.status).toBe(winners[0]!.status);
		});
	});
});
