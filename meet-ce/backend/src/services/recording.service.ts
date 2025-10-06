import { MeetRecordingFilters, MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { EgressInfo, EgressStatus, EncodedFileOutput, EncodedFileType, RoomCompositeOptions } from 'livekit-server-sdk';
import ms from 'ms';
import { Readable } from 'stream';
import { uid } from 'uid';
import INTERNAL_CONFIG from '../config/internal-config.js';
import { MEET_S3_SUBBUCKET } from '../environment.js';
import { MeetLock, RecordingHelper, UtilsHelper } from '../helpers/index.js';
import {
	DistributedEventType,
	errorRecordingAlreadyStarted,
	errorRecordingAlreadyStopped,
	errorRecordingCannotBeStoppedWhileStarting,
	errorRecordingNotFound,
	errorRecordingNotStopped,
	errorRecordingStartTimeout,
	errorRoomHasNoParticipants,
	errorRoomNotFound,
	isErrorRecordingAlreadyStopped,
	isErrorRecordingCannotBeStoppedWhileStarting,
	isErrorRecordingNotFound,
	OpenViduMeetError
} from '../models/index.js';
import {
	DistributedEventService,
	FrontendEventService,
	IScheduledTask,
	LiveKitService,
	LoggerService,
	MeetStorageService,
	MutexService,
	RedisLock,
	TaskSchedulerService
} from './index.js';

@injectable()
export class RecordingService {
	constructor(
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService,
		@inject(DistributedEventService) protected systemEventService: DistributedEventService,
		@inject(MeetStorageService) protected storageService: MeetStorageService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(LoggerService) protected logger: LoggerService
	) {
		// Register the recording garbage collector task
		const recordingGarbageCollectorTask: IScheduledTask = {
			name: 'activeRecordingGarbageCollector',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.RECORDING_LOCK_GC_INTERVAL,
			callback: this.performRecordingLocksGarbageCollection.bind(this)
		};
		this.taskSchedulerService.registerTask(recordingGarbageCollectorTask);

		// Register the stale recordings cleanup task
		const staleRecordingsCleanupTask: IScheduledTask = {
			name: 'staleRecordingsCleanup',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.RECORDING_STALE_CLEANUP_INTERVAL,
			callback: this.performStaleRecordingsCleanup.bind(this)
		};
		this.taskSchedulerService.registerTask(staleRecordingsCleanupTask);
	}

	async startRecording(roomId: string): Promise<MeetRecordingInfo> {
		let acquiredLock: RedisLock | null = null;
		let eventListener!: (info: Record<string, unknown>) => void;
		let recordingId = '';
		let timeoutId: NodeJS.Timeout | undefined;
		let isOperationCompleted = false;

		try {
			// Attempt to acquire lock. If the lock is not acquired, the recording is already active.
			acquiredLock = await this.acquireRoomRecordingActiveLock(roomId);

			if (!acquiredLock) throw errorRecordingAlreadyStarted(roomId);

			await this.validateRoomForStartRecording(roomId);

			// Manually send the recording signal to OpenVidu Components for avoiding missing event if timeout occurs
			// and the egress_started webhook is not received.
			await this.frontendEventService.sendRecordingSignalToOpenViduComponents(roomId, {
				recordingId: '',
				roomId,
				roomName: roomId,
				status: MeetRecordingStatus.STARTING
			});

			const timeoutPromise = new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => {
					if (isOperationCompleted) return;

					isOperationCompleted = true;

					//Clean up the event listener and timeout
					this.systemEventService.off(DistributedEventType.RECORDING_ACTIVE, eventListener);
					this.handleRecordingTimeout(recordingId, roomId).catch(() => {});
					reject(errorRecordingStartTimeout(roomId));
				}, ms(INTERNAL_CONFIG.RECORDING_STARTED_TIMEOUT));
			});

			const activeEgressEventPromise = new Promise<MeetRecordingInfo>((resolve) => {
				eventListener = (info: Record<string, unknown>) => {
					// Process the event only if it belongs to the current room.
					// Each room has only ONE active recording at the same time
					if (info?.roomId !== roomId || isOperationCompleted) return;

					isOperationCompleted = true;

					clearTimeout(timeoutId);
					this.systemEventService.off(DistributedEventType.RECORDING_ACTIVE, eventListener);
					resolve(info as unknown as MeetRecordingInfo);
				};

				this.systemEventService.on(DistributedEventType.RECORDING_ACTIVE, eventListener);
			});

			const startRecordingPromise = (async (): Promise<MeetRecordingInfo> => {
				try {
					const options = this.generateCompositeOptionsFromRequest();
					const output = this.generateFileOutputFromRequest(roomId);
					const egressInfo = await this.livekitService.startRoomComposite(roomId, output, options);

					// Check if operation was completed while we were waiting
					if (isOperationCompleted) {
						this.logger.warn(`startRoomComposite completed after timeout for room ${roomId}`);
						throw errorRecordingStartTimeout(roomId);
					}

					const recordingInfo = await RecordingHelper.toRecordingInfo(egressInfo);
					recordingId = recordingInfo.recordingId;

					// If the recording is already active, we can resolve the promise immediately.
					if (recordingInfo.status === MeetRecordingStatus.ACTIVE) {
						if (!isOperationCompleted) {
							isOperationCompleted = true;
							clearTimeout(timeoutId);
							this.systemEventService.off(DistributedEventType.RECORDING_ACTIVE, eventListener);
							return recordingInfo;
						}
					}

					// Wait for RECORDING_ACTIVE event
					return await activeEgressEventPromise;
				} catch (error) {
					if (isOperationCompleted) {
						this.logger.warn(`startRoomComposite failed after timeout: ${error}`);
						throw errorRecordingStartTimeout(roomId);
					}

					throw error;
				}
			})();

			// Prevent UnhandledPromiseRejection from late failures
			startRecordingPromise.catch((error) => {
				if (!isOperationCompleted) {
					this.logger.error(`Unhandled error in startRecordingPromise: ${error}`);
				}
			});
			return await Promise.race([startRecordingPromise, timeoutPromise]);
		} catch (error) {
			this.logger.error(`Error starting recording in room '${roomId}': ${error}`);
			throw error;
		} finally {
			try {
				if (acquiredLock) {
					// Only clean up resources if the lock was successfully acquired.
					// This prevents unnecessary cleanup operations when the request was rejected
					// due to another recording already in progress in this room.
					clearTimeout(timeoutId);
					this.systemEventService.off(DistributedEventType.RECORDING_ACTIVE, eventListener);
					await this.releaseRecordingLockIfNoEgress(roomId);
				}
			} catch (e) {
				this.logger.warn(`Failed to release recording lock: ${e}`);
			}
		}
	}

	async stopRecording(recordingId: string): Promise<MeetRecordingInfo> {
		try {
			const { roomId, egressId } = RecordingHelper.extractInfoFromRecordingId(recordingId);

			const [egress] = await this.livekitService.getEgress(roomId, egressId);

			if (!egress) {
				throw errorRecordingNotFound(egressId);
			}

			switch (egress.status) {
				case EgressStatus.EGRESS_ACTIVE:
					// Everything is fine, the recording can be stopped.
					break;
				case EgressStatus.EGRESS_STARTING:
					// Avoid pending egress after timeout, stop it immediately
					await this.livekitService.stopEgress(egressId);
					// The recording is still starting, it cannot be stopped yet.
					throw errorRecordingCannotBeStoppedWhileStarting(recordingId);
				default:
					// The recording is already stopped.
					throw errorRecordingAlreadyStopped(recordingId);
			}

			const egressInfo = await this.livekitService.stopEgress(egressId);

			this.logger.info(`Recording stopped successfully for room '${roomId}'.`);
			return await RecordingHelper.toRecordingInfo(egressInfo);
		} catch (error) {
			this.logger.error(`Error stopping recording '${recordingId}': ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes a recording and its associated metadata from the S3 bucket.
	 * If this was the last recording for this room, the room_metadata.json file is also deleted.
	 *
	 * @param recordingId - The unique identifier of the recording to delete.
	 * @returns The recording information that was deleted.
	 */
	async deleteRecording(recordingId: string): Promise<MeetRecordingInfo> {
		try {
			// Get the recording metada and recording info from the S3 bucket
			const { recordingInfo } = await this.storageService.getRecordingMetadata(recordingId);

			// Validate the recording status
			if (!RecordingHelper.canBeDeleted(recordingInfo)) throw errorRecordingNotStopped(recordingId);

			await this.storageService.deleteRecording(recordingId);

			this.logger.info(`Successfully deleted recording ${recordingId}`);

			const { roomId } = recordingInfo;
			const shouldDeleteRoomMetadata = await this.shouldDeleteRoomMetadata(roomId);

			if (shouldDeleteRoomMetadata) {
				this.logger.verbose(`Deleting room_metadata.json for rooms: ${roomId}}`);
				await this.storageService.deleteArchivedRoomMetadata(roomId);
			}

			return recordingInfo;
		} catch (error) {
			this.logger.error(`Error deleting recording ${recordingId}: ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes all recordings for a specific room.
	 * If there are active recordings, it will stop them first and then delete all recordings.
	 * This method will retry deletion for any recordings that fail to delete initially.
	 *
	 * @param roomId - The unique identifier of the room whose recordings should be deleted.
	 */
	async deleteAllRoomRecordings(roomId: string): Promise<void> {
		try {
			this.logger.info(`Starting deletion of all recordings for room '${roomId}'`);

			// Check for active recordings first
			const activeRecordings = await this.livekitService.getInProgressRecordingsEgress(roomId);

			if (activeRecordings.length > 0) {
				this.logger.info(
					`Found ${activeRecordings.length} active recording(s) for room '${roomId}', stopping them first`
				);

				// Stop all active recordings
				const stopPromises = activeRecordings.map(async (egressInfo) => {
					const recordingId = RecordingHelper.extractRecordingIdFromEgress(egressInfo);

					try {
						this.logger.info(`Stopping active recording '${recordingId}'`);
						await this.livekitService.stopEgress(egressInfo.egressId);
						// Wait a bit for recording to fully stop
						await new Promise((resolve) => setTimeout(resolve, 1000));

						// Check if the recording has stopped and update status if needed
						const recording = await this.getRecording(recordingId);

						if (recording.status !== MeetRecordingStatus.COMPLETE) {
							this.logger.warn(`Recording '${recordingId}' did not complete successfully`);
							this.logger.warn(`ABORTING RECORDING '${recordingId}'`);
							await this.updateRecordingStatus(recordingId, MeetRecordingStatus.ABORTED);
						}

						this.logger.info(`Successfully stopped recording '${recordingId}'`);
					} catch (error) {
						this.logger.error(`Failed to stop recording '${recordingId}': ${error}`);
						// Continue with deletion anyway
					}
				});

				await Promise.allSettled(stopPromises);
			}

			// Get all recording IDs for the room
			const allRecordingIds = await this.getAllRecordingIdsForRoom(roomId);

			if (allRecordingIds.length === 0) {
				this.logger.info(`No recordings found for room '${roomId}'`);
				return;
			}

			this.logger.info(
				`Found ${allRecordingIds.length} recordings for room '${roomId}', proceeding with deletion`
			);

			// Attempt initial deletion
			let remainingRecordings = [...allRecordingIds];
			let retryCount = 0;
			const maxRetries = 3;
			const retryDelayMs = 1000;

			while (remainingRecordings.length > 0 && retryCount < maxRetries) {
				if (retryCount > 0) {
					this.logger.info(
						`Retry ${retryCount}/${maxRetries}: attempting to delete ${remainingRecordings.length} remaining recordings`
					);
					await new Promise((resolve) => setTimeout(resolve, retryDelayMs * retryCount));
				}

				const { failed } = await this.bulkDeleteRecordingsAndAssociatedFiles(
					remainingRecordings,
					roomId
				);

				if (failed.length === 0) {
					this.logger.info(`Successfully deleted all recordings for room '${roomId}'`);
					return;
				}

				// Prepare for retry with failed recordings
				remainingRecordings = failed.map((failed) => failed.recordingId);
				retryCount++;

				this.logger.warn(
					`${failed.length} recordings failed to delete for room '${roomId}': ${remainingRecordings.join(', ')}`
				);

				if (retryCount < maxRetries) {
					this.logger.info(`Will retry deletion in ${retryDelayMs * retryCount}ms`);
				}
			}

			// Final check and logging
			if (remainingRecordings.length > 0) {
				this.logger.error(
					`Failed to delete ${remainingRecordings.length} recordings for room '${roomId}' after ${maxRetries} attempts: ${remainingRecordings.join(', ')}`
				);
				throw new Error(
					`Failed to delete all recordings for room '${roomId}'. ${remainingRecordings.length} recordings could not be deleted.`
				);
			}
		} catch (error) {
			this.logger.error(`Error deleting all recordings for room '${roomId}': ${error}`);
			throw error;
		}
	}

	/**
	 * Helper method to get all recording IDs for a specific room.
	 * Handles pagination to ensure all recordings are retrieved.
	 *
	 * @param roomId - The room ID to get recordings for
	 * @returns Array of all recording IDs for the room
	 */
	protected async getAllRecordingIdsForRoom(roomId: string): Promise<string[]> {
		const allRecordingIds: string[] = [];
		let nextPageToken: string | undefined;

		do {
			const response = await this.storageService.getAllRecordings(roomId, 100, nextPageToken);
			const recordingIds = response.recordings.map((recording) => recording.recordingId);
			allRecordingIds.push(...recordingIds);
			nextPageToken = response.nextContinuationToken;
		} while (nextPageToken);

		return allRecordingIds;
	}

	/**
	 * Deletes multiple recordings in bulk from S3.
	 * For each provided egressId, the metadata and recording file are deleted (only if the status is stopped).
	 *
	 * @param recordingIds Array of recording identifiers.
	 * @param roomId Optional room identifier to delete only recordings from a specific room.
	 * @returns An object containing:
	 * - `deleted`: An array of successfully deleted recording IDs.
	 * - `notDeleted`: An array of objects containing recording IDs and error messages for those that could not be deleted.
	 */
	async bulkDeleteRecordingsAndAssociatedFiles(
		recordingIds: string[],
		roomId?: string
	): Promise<{ deleted: string[]; failed: { recordingId: string; error: string }[] }> {
		const validRecordingIds: Set<string> = new Set<string>();
		const deletedRecordings: Set<string> = new Set<string>();
		const failedRecordings: Set<{ recordingId: string; error: string }> = new Set();
		const roomsToCheck: Set<string> = new Set();

		for (const recordingId of recordingIds) {
			// If a roomId is provided, only process recordings from that room
			if (roomId) {
				const { roomId: recRoomId } = RecordingHelper.extractInfoFromRecordingId(recordingId);

				if (recRoomId !== roomId) {
					this.logger.warn(`Skipping recording '${recordingId}' as it does not belong to room '${roomId}'`);
					failedRecordings.add({
						recordingId,
						error: `Recording '${recordingId}' does not belong to room '${roomId}'`
					});
					continue;
				}
			}

			try {
				// Check if the recording is in progress
				const { recordingInfo } = await this.storageService.getRecordingMetadata(recordingId);

				if (!RecordingHelper.canBeDeleted(recordingInfo)) {
					throw errorRecordingNotStopped(recordingId);
				}

				validRecordingIds.add(recordingId);
				deletedRecordings.add(recordingId);

				// Track room for metadata cleanup
				roomsToCheck.add(recordingInfo.roomId);
			} catch (error) {
				this.logger.error(`BulkDelete: Error processing recording '${recordingId}': ${error}`);
				failedRecordings.add({ recordingId, error: (error as OpenViduMeetError).message });
			}
		}

		if (validRecordingIds.size === 0) {
			this.logger.warn(`BulkDelete: No eligible recordings found for deletion.`);
			return { deleted: Array.from(deletedRecordings), failed: Array.from(failedRecordings) };
		}

		// Delete recordings and its metadata from S3
		try {
			await this.storageService.deleteRecordings(Array.from(validRecordingIds));
			this.logger.info(`BulkDelete: Successfully deleted ${validRecordingIds.size} recordings.`);
		} catch (error) {
			this.logger.error(`BulkDelete: Error performing bulk deletion: ${error}`);
			throw error;
		}

		// Check if the room metadata file should be deleted
		const roomMetadataToDelete: string[] = [];

		for (const roomId of roomsToCheck) {
			const shouldDeleteRoomMetadata = await this.shouldDeleteRoomMetadata(roomId);

			if (shouldDeleteRoomMetadata) {
				roomMetadataToDelete.push(roomId);
			}
		}

		if (roomMetadataToDelete.length === 0) {
			this.logger.verbose(`BulkDelete: No room metadata files to delete.`);
			return { deleted: Array.from(deletedRecordings), failed: Array.from(failedRecordings) };
		}

		// Perform bulk deletion of room metadata files
		try {
			await Promise.all(
				roomMetadataToDelete.map((roomId) => this.storageService.deleteArchivedRoomMetadata(roomId))
			);
			this.logger.verbose(`BulkDelete: Successfully deleted ${roomMetadataToDelete.length} room metadata files.`);
		} catch (error) {
			this.logger.error(`BulkDelete: Error performing bulk deletion: ${error}`);
			throw error;
		}

		return {
			deleted: Array.from(deletedRecordings),
			failed: Array.from(failedRecordings)
		};
	}

	/**
	 * Checks if a room's metadata file should be deleted by determining if there
	 * are any remaining recording metadata files for the room.
	 *
	 * @param roomId - The identifier of the room to check
	 * @returns A promise that resolves to a boolean indicating whether the room metadata should be deleted.
	 */
	protected async shouldDeleteRoomMetadata(roomId: string): Promise<boolean | null> {
		try {
			const { recordings } = await this.storageService.getAllRecordings(roomId, 1);

			// If no recordings exist or the list is empty, the room metadata should be deleted
			return !recordings || recordings.length === 0;
		} catch (error) {
			this.logger.warn(`Error checking room metadata for deletion (room ${roomId}): ${error}`);
			return null;
		}
	}

	/**
	 * Retrieves the recording information for a given recording ID.
	 * @param recordingId - The unique identifier of the recording.
	 * @returns A promise that resolves to a MeetRecordingInfo object.
	 */
	async getRecording(recordingId: string, fields?: string): Promise<MeetRecordingInfo> {
		const { recordingInfo } = await this.storageService.getRecordingMetadata(recordingId);

		return UtilsHelper.filterObjectFields(recordingInfo, fields) as MeetRecordingInfo;
	}

	/**
	 * Retrieves a paginated list of all recordings stored in the S3 bucket.
	 *
	 * @param maxItems - The maximum number of items to retrieve in a single request.
	 * @param nextPageToken - (Optional) A token to retrieve the next page of results.
	 * @returns A promise that resolves to an object containing:
	 * - `recordings`: An array of `MeetRecordingInfo` objects representing the recordings.
	 * - `isTruncated`: A boolean indicating whether there are more items to retrieve.
	 * - `nextPageToken`: (Optional) A token to retrieve the next page of results, if available.
	 * @throws Will throw an error if there is an issue retrieving the recordings.
	 */
	async getAllRecordings(filters: MeetRecordingFilters): Promise<{
		recordings: MeetRecordingInfo[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		try {
			const { maxItems, nextPageToken, roomId, fields } = filters;
			const response = await this.storageService.getAllRecordings(roomId, maxItems, nextPageToken);

			// Apply field filtering if specified
			if (fields) {
				response.recordings = response.recordings.map((rec) =>
					UtilsHelper.filterObjectFields(rec, fields)
				) as MeetRecordingInfo[];
			}

			const { recordings, isTruncated, nextContinuationToken } = response;

			this.logger.info(`Retrieved ${recordings.length} recordings.`);
			// Return the paginated list of recordings
			return {
				recordings,
				isTruncated: Boolean(isTruncated),
				nextPageToken: nextContinuationToken
			};
		} catch (error) {
			this.logger.error(`Error getting recordings: ${error}`);
			throw error;
		}
	}

	/**
	 * Helper method to check if a room has recordings
	 *
	 * @param roomId - The ID of the room to check
	 * @returns A promise that resolves to true if the room has recordings, false otherwise
	 */
	async hasRoomRecordings(roomId: string): Promise<boolean> {
		try {
			const response = await this.storageService.getAllRecordings(roomId, 1);
			return response.recordings.length > 0;
		} catch (error) {
			this.logger.warn(`Error checking recordings for room '${roomId}': ${error}`);
			return false;
		}
	}

	async getRecordingAsStream(
		recordingId: string,
		rangeHeader?: string
	): Promise<{ fileSize: number | undefined; fileStream: Readable; start?: number; end?: number }> {
		const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

		// Ensure the recording is streamable
		const recordingInfo: MeetRecordingInfo = await this.getRecording(recordingId);

		if (recordingInfo.status !== MeetRecordingStatus.COMPLETE) {
			throw errorRecordingNotStopped(recordingId);
		}

		let validatedRange = undefined;

		// Parse the range header if provided
		if (rangeHeader) {
			const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/)!;
			const endStr = match[2];

			const start = parseInt(match[1], 10);
			const end = endStr ? parseInt(endStr, 10) : start + DEFAULT_CHUNK_SIZE - 1;
			validatedRange = { start, end };
			this.logger.debug(`Streaming partial content for recording '${recordingId}' from ${start} to ${end}.`);
		} else {
			this.logger.debug(`Streaming full content for recording '${recordingId}'.`);
		}

		return this.storageService.getRecordingMedia(recordingId, validatedRange);
	}

	protected async validateRoomForStartRecording(roomId: string): Promise<void> {
		const room = await this.storageService.getMeetRoom(roomId);

		if (!room) throw errorRoomNotFound(roomId);

		//TODO: Check if the room has participants before starting the recording
		//room.numParticipants === 0 ? throw errorNoParticipants(roomId);
		const lkRoom = await this.livekitService.getRoom(roomId);

		if (!lkRoom) throw errorRoomNotFound(roomId);

		const hasParticipants = await this.livekitService.roomHasParticipants(roomId);

		if (!hasParticipants) throw errorRoomHasNoParticipants(roomId);
	}

	/**
	 * Acquires a Redis-based lock to indicate that a recording is active for a specific room.
	 *
	 * This lock will be used to prevent multiple recording start requests from being processed
	 * simultaneously for the same room.
	 *
	 * The active recording lock will be released when the recording ends (handleEgressEnded) or when the room is finished (handleMeetingFinished).
	 *
	 * @param roomId - The name of the room to acquire the lock for.
	 */
	protected async acquireRoomRecordingActiveLock(roomId: string): Promise<RedisLock | null> {
		const lockName = MeetLock.getRecordingActiveLock(roomId);

		try {
			const lock = await this.mutexService.acquire(lockName, ms(INTERNAL_CONFIG.RECORDING_LOCK_TTL));
			return lock;
		} catch (error) {
			this.logger.warn(`Error acquiring lock ${lockName} on egress started: ${error}`);
			return null;
		}
	}

	/**
	 * Releases the active recording lock for a specified room, but only if there are no active egress operations.
	 *
	 * This method first checks for any ongoing egress operations for the room.
	 * If active egress operations are found, the lock isn't released as recording is still considered active.
	 * Otherwise, it proceeds to release the mutex lock associated with the room's recording.
	 */
	async releaseRecordingLockIfNoEgress(roomId: string): Promise<void> {
		if (roomId) {
			const lockName = MeetLock.getRecordingActiveLock(roomId);
			const egress = await this.livekitService.getActiveEgress(roomId);

			if (egress.length > 0) {
				this.logger.verbose(
					`Active egress found for room ${roomId}: ${egress.map((e) => e.egressId).join(', ')}`
				);
				this.logger.debug(`Cannot release recording lock for room '${roomId}'. Recording is still active.`);
				return;
			}

			try {
				await this.mutexService.release(lockName);
				this.logger.verbose(`Recording active lock released for room '${roomId}'.`);
			} catch (error) {
				this.logger.warn(`Error releasing recording lock for room '${roomId}' on egress ended: ${error}`);
			}
		}
	}

	protected generateCompositeOptionsFromRequest(layout = 'grid'): RoomCompositeOptions {
		return {
			layout: layout
			// customBaseUrl: customLayout,
			// audioOnly: false,
			// videoOnly: false
			// encodingOptions
		};
	}

	/**
	 * Generates a file output object based on the provided room name and file name.
	 * @param recordingId - The recording id.
	 * @param fileName - The name of the file (default is 'recording').
	 * @returns The generated file output object.
	 */
	protected generateFileOutputFromRequest(roomId: string): EncodedFileOutput {
		// Added unique identifier to the file path for avoiding overwriting
		const recordingName = `${roomId}--${uid(10)}`;

		// Generate the file path with the openviud-meet subbucket and the recording prefix
		const filepath = `${MEET_S3_SUBBUCKET}/${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/${roomId}/${recordingName}`;

		return new EncodedFileOutput({
			fileType: EncodedFileType.DEFAULT_FILETYPE,
			filepath,
			disableManifest: true
		});
	}

	/**
	 * Escapes special characters in a string to make it safe for use in a regular expression.
	 * This method ensures that characters with special meaning in regular expressions
	 * (e.g., `.`, `*`, `+`, `?`, `^`, `$`, `{`, `}`, `(`, `)`, `|`, `[`, `]`, `\`) are
	 * properly escaped.
	 *
	 * @param str - The input string to sanitize for use in a regular expression.
	 * @returns A new string with special characters escaped.
	 */
	protected sanitizeRegExp(str: string) {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	/**
	 * Handles the timeout event for a recording session in a specific room.
	 *
	 * This method is triggered when a recording cleanup timer fires, indicating that a recording
	 * has either failed to start or has not been stopped within the expected timeframe.
	 * It attempts to update the recording status to `FAILED` and stop the recording if necessary.
	 *
	 * If the recording is already stopped, not found, or cannot be stopped because it is still starting,
	 * the method logs the appropriate message and determines whether to release the active recording lock.
	 *
	 * Regardless of the outcome, if the lock should be released, it attempts to release the recording lock
	 * for the room to allow further recordings.
	 *
	 * @param recordingId - The unique identifier of the recording session.
	 * @param roomId - The unique identifier of the room associated with the recording.
	 * @returns A promise that resolves when the timeout handling is complete.
	 */
	protected async handleRecordingTimeout(recordingId: string, roomId: string) {
		this.logger.debug(`Recording cleanup timer triggered for room '${roomId}'.`);

		let shouldReleaseLock = false;

		try {
			if (!recordingId || recordingId.trim() === '') {
				this.logger.warn(
					`Timeout triggered but recordingId is empty for room '${roomId}'. Recording likely failed to start.`
				);
				shouldReleaseLock = true;
				const recordingInfo: MeetRecordingInfo = {
					recordingId,
					roomId,
					roomName: roomId,
					status: MeetRecordingStatus.FAILED,
					error: `No egress service was able to register a request. Check your CPU usage or if there's any Media Node with enough CPU. Remember that by default, composite recording uses 4 CPUs for each room.`
				};

				// Manually send the recording FAILED signal to OpenVidu Components for avoiding missing event
				// because of the egress_ended or egress_failed webhook is not received.
				await this.frontendEventService.sendRecordingSignalToOpenViduComponents(roomId, recordingInfo);
			} else {
				await this.updateRecordingStatus(recordingId, MeetRecordingStatus.FAILED);
				await this.stopRecording(recordingId);
				// The recording was stopped successfully
				// the cleanup timer will be cancelled when the egress_ended event is received.
			}
		} catch (error) {
			if (error instanceof OpenViduMeetError) {
				// The recording is already stopped or not found in LiveKit.
				const isRecordingAlreadyStopped = isErrorRecordingAlreadyStopped(error, recordingId);
				const isRecordingNotFound = isErrorRecordingNotFound(error, recordingId);

				if (isRecordingAlreadyStopped || isRecordingNotFound) {
					this.logger.verbose(`Recording ${recordingId} is already stopped or not found.`);
					this.logger.verbose(' Proceeding to release the recording active lock.');
					shouldReleaseLock = true;
				} else if (isErrorRecordingCannotBeStoppedWhileStarting(error, recordingId)) {
					// The recording is still starting, the cleanup timer will be cancelled.
					this.logger.warn(
						`Recording ${recordingId} is still starting. Skipping recording active lock release.`
					);
				} else {
					// An error occurred while stopping the recording.
					this.logger.error(`Error stopping recording ${recordingId}: ${error.message}`);
					shouldReleaseLock = true;
				}
			} else {
				this.logger.error(`Unexpected error while run recording cleanup timer:`, error);
			}
		} finally {
			if (shouldReleaseLock) {
				try {
					await this.releaseRecordingLockIfNoEgress(roomId);
					this.logger.debug(`Recording active lock released for room ${roomId}.`);
				} catch (releaseError) {
					this.logger.error(`Error releasing active recording lock for room ${roomId}: ${releaseError}`);
				}
			}
		}
	}

	protected async updateRecordingStatus(recordingId: string, status: MeetRecordingStatus): Promise<void> {
		const recordingInfo = await this.getRecording(recordingId);
		recordingInfo.status = status;
		await this.storageService.saveRecordingMetadata(recordingInfo);
	}

	/**
	 * Performs garbage collection for orphaned recording locks in the system.
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
	 * @throws {OpenViduMeetError} Rethrows any errors except 404 (room not found)
	 * @protected
	 */
	protected async performRecordingLocksGarbageCollection(): Promise<void> {
		this.logger.debug('Starting orphaned recording locks cleanup process');
		// Create the lock pattern for finding all recording locks
		const lockPattern = MeetLock.getRecordingActiveLock('roomId').replace('roomId', '*');
		this.logger.debug(`Searching for locks with pattern: ${lockPattern}`);
		let recordingLocks: RedisLock[] = [];

		try {
			recordingLocks = await this.mutexService.getLocksByPrefix(lockPattern);

			if (recordingLocks.length === 0) {
				this.logger.debug('No active recording locks found');
				return;
			}

			// Extract all rooms ids from the active locks
			const lockPrefix = lockPattern.replace('*', '');

			const roomIds = recordingLocks.map((lock) => lock.resources[0].replace(lockPrefix, ''));

			const BATCH_SIZE = 10;

			for (let i = 0; i < roomIds.length; i += BATCH_SIZE) {
				const batch = roomIds.slice(i, i + BATCH_SIZE);

				const results = await Promise.allSettled(
					batch.map((roomId) => this.evaluateAndReleaseOrphanedLock(roomId, lockPrefix))
				);

				results.forEach((result, index) => {
					if (result.status === 'rejected') {
						this.logger.error(`Failed to process lock for room ${batch[index]}:`, result.reason);
					}
				});
			}
		} catch (error) {
			this.logger.error('Error retrieving recording locks:', error);
		}
	}

	/**
	 * Evaluates and releases orphaned locks for a specific room.
	 *
	 * @param roomId - The ID of the room associated with the lock.
	 * @param lockPrefix - The prefix used to identify the lock.
	 */
	protected async evaluateAndReleaseOrphanedLock(roomId: string, lockPrefix: string): Promise<void> {
		const lockKey = `${lockPrefix}${roomId}`;
		const gracePeriodMs = ms(INTERNAL_CONFIG.RECORDING_ORPHANED_LOCK_GRACE_PERIOD);

		const safeLockRelease = async (lockKey: string) => {
			const stillExists = await this.mutexService.lockExists(lockKey);

			if (stillExists) {
				await this.mutexService.release(lockKey);
			}
		};

		try {
			// Verify if the lock still exists
			const lockExists = await this.mutexService.lockExists(lockKey);

			if (!lockExists) {
				this.logger.debug(`Lock for room ${roomId} no longer exists, skipping cleanup`);
				return;
			}

			// Get the lock creation timestamp
			const lockCreatedAt = await this.mutexService.getLockCreatedAt(lockKey);

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

			this.logger.debug(`Room ${roomId} no longer exists or has no publishers, releasing orphaned lock`);
			await safeLockRelease(lockKey);
		} catch (error) {
			this.logger.error(`Error processing orphan lock for room ${roomId}:`, error);
			throw error;
		}
	}

	/**
	 * Performs cleanup of stale recordings across the system.
	 *
	 * This method identifies and aborts recordings that have become stale by:
	 * 1. Getting all recordings in progress from LiveKit
	 * 2. Checking their last update time
	 * 3. Aborting recordings that have exceeded the stale threshold
	 * 4. Updating their status in storage
	 *
	 * Stale recordings can occur when:
	 * - Network issues prevent normal completion
	 * - LiveKit egress process hangs or crashes
	 * - Room is forcibly deleted while recording is active
	 *
	 * @returns {Promise<void>} A promise that resolves when the cleanup process completes
	 * @protected
	 */
	protected async performStaleRecordingsCleanup(): Promise<void> {
		this.logger.debug('Starting stale recordings cleanup process');

		try {
			// Get all in-progress recordings from LiveKit (across all rooms)
			const allInProgressRecordings = await this.livekitService.getInProgressRecordingsEgress();

			if (allInProgressRecordings.length === 0) {
				this.logger.debug('No in-progress recordings found');
				return;
			}

			this.logger.debug(`Found ${allInProgressRecordings.length} in-progress recordings to check`);

			// Process in batches to avoid overwhelming the system
			const BATCH_SIZE = 10;
			let totalProcessed = 0;
			let totalAborted = 0;

			for (let i = 0; i < allInProgressRecordings.length; i += BATCH_SIZE) {
				const batch = allInProgressRecordings.slice(i, i + BATCH_SIZE);

				const results = await Promise.allSettled(
					batch.map((egressInfo: EgressInfo) => this.evaluateAndAbortStaleRecording(egressInfo))
				);

				results.forEach((result: PromiseSettledResult<boolean>, index: number) => {
					totalProcessed++;

					if (result.status === 'fulfilled' && result.value) {
						totalAborted++;
					} else if (result.status === 'rejected') {
						const recordingId = RecordingHelper.extractRecordingIdFromEgress(batch[index]);
						this.logger.error(`Failed to process stale recording ${recordingId}:`, result.reason);
					}
				});
			}

			this.logger.info(
				`Stale recordings cleanup completed: processed=${totalProcessed}, aborted=${totalAborted}`
			);
		} catch (error) {
			this.logger.error('Error in stale recordings cleanup:', error);
		}
	}

	/**
	 * Evaluates a single recording and aborts it if it's considered stale.
	 *
	 * @param egressInfo - The egress information for the recording to evaluate
	 * @returns {Promise<boolean>} True if the recording was aborted, false if it's still fresh
	 * @protected
	 */
	protected async evaluateAndAbortStaleRecording(egressInfo: EgressInfo): Promise<boolean> {
		const recordingId = RecordingHelper.extractRecordingIdFromEgress(egressInfo);
		const { roomId } = RecordingHelper.extractInfoFromRecordingId(recordingId);
		const updatedAt = RecordingHelper.extractUpdatedDate(egressInfo);
		const staleAfterMs = ms(INTERNAL_CONFIG.RECORDING_STALE_AFTER);

		try {
			const { status } = await this.getRecording(recordingId);

			if (status === MeetRecordingStatus.ABORTED) {
				this.logger.warn(`Recording ${recordingId} is already aborted`);
				return true;
			}

			if (!updatedAt) {
				this.logger.warn(`Recording ${recordingId} has no updatedAt timestamp, keeping it as fresh`);
				return false;
			}

			const lkRoomExists = await this.livekitService.roomExists(roomId);
			const ageIsStale = updatedAt < Date.now() - staleAfterMs;
			let isRecordingStale = false;

			if (ageIsStale) {
				if (!lkRoomExists) {
					isRecordingStale = true; // There is no room and updated before stale time -> stale
				} else {
					const lkRoom = await this.livekitService.getRoom(roomId);
					isRecordingStale = lkRoom.numPublishers === 0; // No publishers in the room and updated before stale time -> stale
				}
			}

			// Check if recording has not been updated recently

			this.logger.debug(`Recording ${recordingId} last updated at ${new Date(updatedAt).toISOString()}`);

			if (!isRecordingStale) {
				this.logger.debug(`Recording ${recordingId} is still fresh`);
				return false;
			}

			this.logger.warn(`Room ${roomId} does not exist and recording ${recordingId} is stale, aborting...`);

			// Abort the recording
			const { egressId } = RecordingHelper.extractInfoFromRecordingId(recordingId);

			await Promise.all([
				this.updateRecordingStatus(recordingId, MeetRecordingStatus.ABORTED),
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
