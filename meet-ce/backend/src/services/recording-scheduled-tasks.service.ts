import type { MeetRecordingInfo } from '@openvidu-meet/typings';
import { MeetRecordingStatus } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { RecordingHelper } from '../helpers/recording.helper.js';
import { MeetLock } from '../helpers/redis.helper.js';
import type { IScheduledTask } from '../models/task-scheduler.model.js';
import { RecordingRepository } from '../repositories/recording.repository.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import type { RedisLock } from './mutex.service.js';
import { MutexService } from './mutex.service.js';
import { RecordingService } from './recording.service.js';
import { TaskSchedulerService } from './task-scheduler.service.js';

/**
 * Service responsible for managing scheduled tasks related to recordings.
 *
 * This service handles periodic cleanup operations for recordings, such as:
 * - Garbage collection of orphaned active recording locks
 * - Garbage collection of stale recordings that haven't completed properly
 */
@injectable()
export class RecordingScheduledTasksService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(RecordingService) protected recordingService: RecordingService,
		@inject(RecordingRepository) protected recordingRepository: RecordingRepository,
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService
	) {
		this.registerScheduledTasks();
	}

	/**
	 * Registers all scheduled tasks related to recordings.
	 */
	protected registerScheduledTasks(): void {
		const activeRecordingLocksGCTask: IScheduledTask = {
			name: 'activeRecordingLocksGC',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.RECORDING_ACTIVE_LOCK_GC_INTERVAL,
			callback: this.performActiveRecordingLocksGC.bind(this)
		};
		this.taskSchedulerService.registerTask(activeRecordingLocksGCTask);

		const staleRecordingsGCTask: IScheduledTask = {
			name: 'staleRecordingsGC',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.RECORDING_STALE_GC_INTERVAL,
			callback: this.performStaleRecordingsGC.bind(this)
		};
		this.taskSchedulerService.registerTask(staleRecordingsGCTask);
	}

	/**
	 * Performs garbage collection for orphaned active recording locks in the system.
	 *
	 * This method identifies and releases locks that are no longer needed by:
	 * 1. Finding all active recording locks in the system
	 * 2. Checking if the associated room still exists in LiveKit
	 * 3. For existing rooms, checking if they have active recordings in progress
	 * 4. Releasing lock if the room exists but has no participants or no active recordings
	 * 5. Releasing lock if the room does not exist
	 *
	 * Orphaned locks can occur when:
	 * - A room is deleted but its lock remains
	 * - A recording completes but the lock isn't released
	 * - System crashes during the recording process
	 *
	 * @returns {Promise<void>} A promise that resolves when the cleanup process completes
	 */
	protected async performActiveRecordingLocksGC(): Promise<void> {
		this.logger.debug('Starting orphaned recording locks cleanup process');
		// Create the lock pattern for finding all recording locks
		const lockPattern = MeetLock.getRecordingActiveLock('*');
		this.logger.debug(`Searching for locks with pattern: ${lockPattern}`);
		let recordingLocks: RedisLock[] = [];

		try {
			recordingLocks = await this.mutexService.getRegistryLocksByPrefix(lockPattern);

			if (recordingLocks.length === 0) {
				this.logger.debug('No active recording locks found');
				return;
			}

			// Extract all rooms ids from the active locks
			const lockPrefix = lockPattern.replace('*', '');
			const roomIds = recordingLocks.map((lock) => lock.resources[0].replace(lockPrefix, ''));

			await runConcurrently(
				roomIds,
				async (roomId) => {
					try {
						await this.evaluateAndReleaseOrphanedLock(roomId, lockPrefix);
						this.logger.verbose(`Processed orphaned lock for room ${roomId} successfully.`);
					} catch (error) {
						this.logger.error(`Failed to process lock for room ${roomId}:`, error);
						// Continue processing other locks even if one fails
					}
				},
				{ concurrency: 10, failFast: true }
			);
		} catch (error) {
			this.logger.error('Error retrieving recording locks:', error);
		}
	}

	/**
	 * Evaluates and releases orphaned active recording locks for a specific room.
	 *
	 * @param roomId - The ID of the room associated with the lock.
	 * @param lockPrefix - The prefix used to identify the lock.
	 */
	protected async evaluateAndReleaseOrphanedLock(roomId: string, lockPrefix: string): Promise<void> {
		const lockKey = `${lockPrefix}${roomId}`;
		const gracePeriodMs = ms(INTERNAL_CONFIG.RECORDING_ORPHANED_ACTIVE_LOCK_GRACE_PERIOD);

		const safeLockRelease = async (lockKey: string) => {
			const stillExists = await this.mutexService.lockRegistryExists(lockKey);

			if (stillExists) {
				await this.mutexService.releaseWithRegistry(lockKey);
			}
		};

		try {
			// Verify if the lock still exists
			const lockExists = await this.mutexService.lockRegistryExists(lockKey);

			if (!lockExists) {
				this.logger.debug(`Lock for room ${roomId} no longer exists, skipping cleanup`);
				return;
			}

			// Get the lock creation timestamp
			const lockCreatedAt = await this.mutexService.getLockCreatedAtFromRegistry(lockKey);

			if (lockCreatedAt == null) {
				this.logger.warn(
					`Lock for room ${roomId} reported as existing but has no creation date. Treating as orphaned.`
				);
				await safeLockRelease(lockKey);
				return;
			}

			// Verify if the lock is too recent
			const lockAge = Date.now() - lockCreatedAt;

			if (lockAge < gracePeriodMs) {
				this.logger.debug(
					`Lock for room ${roomId} is too recent (${ms(lockAge)}), skipping orphan lock cleanup`
				);
				return;
			}

			const [lkRoomExists, inProgressRecordings] = await Promise.all([
				this.livekitService.roomExists(roomId),
				this.livekitService.getInProgressRecordingsEgress(roomId)
			]);

			if (lkRoomExists) {
				const lkRoom = await this.livekitService.getRoom(roomId);
				const hasPublishers = lkRoom.numPublishers > 0;

				if (hasPublishers) {
					this.logger.debug(`Room ${roomId} exists, checking recordings`);
					const hasInProgressRecordings = inProgressRecordings.length > 0;

					if (hasInProgressRecordings) {
						this.logger.debug(`Room ${roomId} has in-progress recordings, keeping lock`);
						return;
					}

					// No in-progress recordings, releasing orphaned lock
					this.logger.info(`Room ${roomId} has no in-progress recordings, releasing orphaned lock`);
					await safeLockRelease(lockKey);
					return;
				}
			}

			// Release lock if room does not exist or has no publishers
			this.logger.debug(`Room ${roomId} no longer exists or has no publishers, releasing orphaned lock`);
			await safeLockRelease(lockKey);
		} catch (error) {
			this.logger.error(`Error processing orphan lock for room ${roomId}:`, error);
			throw error;
		}
	}

	/**
	 * Performs garbage collection for stale recordings in the system.
	 *
	 * This method identifies and aborts recordings that have become stale by:
	 * 1. Getting active recordings from database in paginated batches (ACTIVE status only)
	 * 2. Processing each batch with bounded concurrency to avoid memory overhead
	 * 3. For each recording, checking if there's a corresponding in-progress egress in LiveKit
	 * 4. If no egress exists, marking the recording as ABORTED
	 * 5. If egress exists, checking last update time and aborting if stale
	 *
	 * Uses pagination to avoid loading all active recordings into memory at once,
	 * which is critical when dealing with thousands of concurrent recordings.
	 *
	 * Stale recordings can occur when:
	 * - Network issues prevent normal completion
	 * - LiveKit egress process hangs or crashes
	 */
	protected async performStaleRecordingsGC(): Promise<void> {
		this.logger.debug('Starting stale recordings cleanup process');

		const BATCH_SIZE = 100; // Process 100 recordings at a time to balance throughput and memory
		let totalProcessed = 0;
		let totalAborted = 0;
		let nextPageToken: string | undefined;
		let hasMore = true;

		try {
			while (hasMore) {
				// Fetch one batch of active recordings
				const batch = await this.recordingRepository.findActiveRecordings(BATCH_SIZE, nextPageToken);

				if (batch.recordings.length === 0) {
					this.logger.debug('No more active recordings found in database');
					break;
				}

				this.logger.debug(
					`Processing batch of ${batch.recordings.length} active recordings (total processed: ${totalProcessed})`
				);

				// Process this batch with bounded concurrency
				const results = await runConcurrently<MeetRecordingInfo, boolean>(
					batch.recordings,
					(recording) => this.evaluateAndAbortStaleRecording(recording),
					{ concurrency: 20 }
				);

				results.forEach((result: PromiseSettledResult<boolean>, index: number) => {
					totalProcessed++;

					if (result.status === 'fulfilled' && result.value) {
						totalAborted++;
					} else if (result.status === 'rejected') {
						this.logger.error(
							`Failed to process recording ${batch.recordings[index].recordingId}:`,
							result.reason
						);
					}
				});

				// Check if there are more batches to process
				hasMore = batch.isTruncated;
				nextPageToken = batch.nextPageToken;
			}

			this.logger.debug(
				`Stale recordings cleanup completed: processed=${totalProcessed}, aborted=${totalAborted}`
			);
		} catch (error) {
			this.logger.error('Error in stale recordings cleanup:', error);
		}
	}

	/**
	 * Evaluates whether a recording is stale and aborts it if necessary.
	 * First checks if there's a corresponding egress in LiveKit. If not, the recording is immediately
	 * considered stale and aborted. If an egress exists, checks if it has been updated within the
	 * configured stale period and whether the associated room exists or has publishers.
	 *
	 * @param recording - The recording information from MongoDB.
	 * @returns A promise that resolves to `true` if the recording was aborted, `false` otherwise.
	 * @throws Will throw an error if there is an issue checking egress existence, room existence,
	 *         or aborting the recording.
	 */
	protected async evaluateAndAbortStaleRecording(recording: MeetRecordingInfo): Promise<boolean> {
		const recordingId = recording.recordingId;
		const roomId = recording.roomId;
		const { egressId } = RecordingHelper.extractInfoFromRecordingId(recordingId);
		const staleAfterMs = ms(INTERNAL_CONFIG.RECORDING_STALE_GRACE_PERIOD);

		try {
			// Check if there's a corresponding egress in LiveKit for this room
			const inProgressRecordings = await this.livekitService.getInProgressRecordingsEgress(roomId);
			const egressInfo = inProgressRecordings.find((egress) => egress.egressId === egressId);

			if (!egressInfo) {
				// No egress found in LiveKit, recording is stale
				this.logger.warn(
					`Recording ${recordingId} has no corresponding egress in LiveKit, marking as stale and aborting...`
				);

				await this.recordingService.updateRecordingStatus(recordingId, MeetRecordingStatus.ABORTED);
				this.logger.info(`Successfully aborted stale recording ${recordingId}`);
				return true;
			}

			// Egress exists, check if it's stale based on updatedAt timestamp
			const updatedAt = RecordingHelper.extractUpdatedDate(egressInfo);

			if (!updatedAt) {
				this.logger.warn(`Recording ${recordingId} has no updatedAt timestamp, keeping it as fresh`);
				return false;
			}

			this.logger.debug(`Recording ${recordingId} last updated at ${new Date(updatedAt).toISOString()}`);

			// Check if recording has not been updated recently
			const lkRoomExists = await this.livekitService.roomExists(roomId);
			const ageIsStale = updatedAt < Date.now() - staleAfterMs;
			let isRecordingStale = false;

			if (ageIsStale) {
				if (!lkRoomExists) {
					isRecordingStale = true; // There is no room and updated before stale time -> stale
				} else {
					const hasParticipants = await this.livekitService.roomHasParticipants(roomId);
					isRecordingStale = !hasParticipants; // No publishers in the room and updated before stale time -> stale
				}
			}

			if (!isRecordingStale) {
				this.logger.debug(`Recording ${recordingId} is still fresh`);
				return false;
			}

			this.logger.warn(
				`Room ${roomId} does not exist or has no participants and recording ${recordingId} is stale, aborting...`
			);

			// Abort the recording
			await Promise.all([
				this.recordingService.updateRecordingStatus(recordingId, MeetRecordingStatus.ABORTED),
				this.livekitService.stopEgress(egressId)
			]);

			this.logger.info(`Successfully aborted stale recording ${recordingId}`);
			return true;
		} catch (error) {
			this.logger.error(`Error processing stale recording ${recordingId}:`, error);
			throw error;
		}
	}
}
