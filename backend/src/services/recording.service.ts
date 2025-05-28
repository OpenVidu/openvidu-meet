import { MeetRecordingFilters, MeetRecordingInfo, MeetRecordingStatus } from '@typings-ce';
import { inject, injectable } from 'inversify';
import { EgressStatus, EncodedFileOutput, EncodedFileType, RoomCompositeOptions } from 'livekit-server-sdk';
import ms from 'ms';
import { Readable } from 'stream';
import { uid } from 'uid';
import INTERNAL_CONFIG from '../config/internal-config.js';
import { MEET_S3_BUCKET, MEET_S3_SUBBUCKET } from '../environment.js';
import { MeetLock, OpenViduComponentsAdapterHelper, RecordingHelper, UtilsHelper } from '../helpers/index.js';
import {
	errorRecordingAlreadyStarted,
	errorRecordingAlreadyStopped,
	errorRecordingCannotBeStoppedWhileStarting,
	errorRecordingNotFound,
	errorRecordingNotStopped,
	errorRecordingRangeNotSatisfiable,
	errorRecordingStartTimeout,
	errorRoomHasNoParticipants,
	errorRoomNotFound,
	internalError,
	isErrorRecordingAlreadyStopped,
	isErrorRecordingCannotBeStoppedWhileStarting,
	isErrorRecordingNotFound,
	OpenViduMeetError,
	SystemEventType
} from '../models/index.js';
import {
	IScheduledTask,
	LiveKitService,
	LoggerService,
	MeetStorageService,
	MutexService,
	RedisLock,
	RoomService,
	S3Service,
	SystemEventService,
	TaskSchedulerService
} from './index.js';

@injectable()
export class RecordingService {
	constructor(
		@inject(S3Service) protected s3Service: S3Service,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService,
		@inject(SystemEventService) protected systemEventService: SystemEventService,
		@inject(MeetStorageService) protected storageService: MeetStorageService,
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
	}

	async startRecording(roomId: string): Promise<MeetRecordingInfo> {
		let acquiredLock: RedisLock | null = null;
		let eventListener!: (info: Record<string, unknown>) => void;
		let recordingId = '';
		let timeoutId: NodeJS.Timeout | undefined;

		try {
			// Attempt to acquire lock. If the lock is not acquired, the recording is already active.
			acquiredLock = await this.acquireRoomRecordingActiveLock(roomId);

			if (!acquiredLock) throw errorRecordingAlreadyStarted(roomId);

			const room = await this.roomService.getMeetRoom(roomId);

			if (!room) throw errorRoomNotFound(roomId);

			//TODO: Check if the room has participants before starting the recording
			//room.numParticipants === 0 ? throw errorNoParticipants(roomId);
			const lkRoom = await this.livekitService.getRoom(roomId);

			if (!lkRoom) throw errorRoomNotFound(roomId);

			const hasParticipants = await this.livekitService.roomHasParticipants(roomId);

			if (!hasParticipants) throw errorRoomHasNoParticipants(roomId);

			const startTimeoutPromise = new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => {
					this.systemEventService.off(SystemEventType.RECORDING_ACTIVE, eventListener);
					this.handleRecordingLockTimeout(recordingId, roomId, reject);
				}, ms(INTERNAL_CONFIG.RECORDING_STARTED_TIMEOUT));
			});

			const eventReceivedPromise = new Promise<MeetRecordingInfo>((resolve) => {
				eventListener = (info: Record<string, unknown>) => {
					// Process the event only if it belongs to the current room.
					// Each room has only ONE active recording at the same time
					if (info?.roomId !== roomId) return;

					clearTimeout(timeoutId);
					this.systemEventService.off(SystemEventType.RECORDING_ACTIVE, eventListener);
					resolve(info as unknown as MeetRecordingInfo);
				};

				this.systemEventService.on(SystemEventType.RECORDING_ACTIVE, eventListener);
			});

			const options = this.generateCompositeOptionsFromRequest();
			const output = this.generateFileOutputFromRequest(roomId);
			const egressInfo = await this.livekitService.startRoomComposite(roomId, output, options);
			const recordingInfo = RecordingHelper.toRecordingInfo(egressInfo);
			recordingId = recordingInfo.recordingId;

			if (recordingInfo.status === MeetRecordingStatus.ACTIVE) {
				clearTimeout(timeoutId);
				this.systemEventService.off(SystemEventType.RECORDING_ACTIVE, eventListener);
				return recordingInfo;
			}

			return await Promise.race([eventReceivedPromise, startTimeoutPromise]);
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
					this.systemEventService.off(SystemEventType.RECORDING_ACTIVE, eventListener);
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
					// The recording is still starting, it cannot be stopped yet.
					throw errorRecordingCannotBeStoppedWhileStarting(recordingId);
				default:
					// The recording is already stopped.
					throw errorRecordingAlreadyStopped(recordingId);
			}

			const egressInfo = await this.livekitService.stopEgress(egressId);

			this.logger.info(`Recording stopped successfully for room '${roomId}'.`);
			return RecordingHelper.toRecordingInfo(egressInfo);
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
			const { filesToDelete, recordingInfo } = await this.getDeletableRecordingFiles(recordingId);
			const { roomId } = RecordingHelper.extractInfoFromRecordingId(recordingId);

			await this.s3Service.deleteObjects(Array.from(filesToDelete));
			this.logger.info(`Successfully deleted ${recordingId}`);

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
	 * Deletes multiple recordings in bulk from S3.
	 * For each provided egressId, the metadata and recording file are deleted (only if the status is stopped).
	 *
	 * @param recordingIds Array of recording identifiers.
	 * @returns An array with the MeetRecordingInfo of the successfully deleted recordings.
	 */
	async bulkDeleteRecordingsAndAssociatedFiles(
		recordingIds: string[]
	): Promise<{ deleted: string[]; notDeleted: { recordingId: string; error: string }[] }> {
		const allFilesToDelete: Set<string> = new Set<string>();
		const deletedRecordings: Set<string> = new Set<string>();
		const notDeletedRecordings: Set<{ recordingId: string; error: string }> = new Set();
		const roomsToCheck: Set<string> = new Set();

		// Check if the recording is in progress
		for (const recordingId of recordingIds) {
			try {
				const { filesToDelete } = await this.getDeletableRecordingFiles(recordingId);
				filesToDelete.forEach((file) => allFilesToDelete.add(file));
				deletedRecordings.add(recordingId);

				// Track the roomId for checking if the room metadata file should be deleted
				const { roomId } = RecordingHelper.extractInfoFromRecordingId(recordingId);
				roomsToCheck.add(roomId);
			} catch (error) {
				this.logger.error(`BulkDelete: Error processing recording ${recordingId}: ${error}`);
				notDeletedRecordings.add({ recordingId, error: (error as OpenViduMeetError).message });
			}
		}

		if (allFilesToDelete.size === 0) {
			this.logger.warn(`BulkDelete: No eligible recordings found for deletion.`);
			return { deleted: Array.from(deletedRecordings), notDeleted: Array.from(notDeletedRecordings) };
		}

		// Delete recordings and its metadata from S3
		try {
			await this.s3Service.deleteObjects(Array.from(allFilesToDelete));
			this.logger.info(`BulkDelete: Successfully deleted ${allFilesToDelete.size} objects from S3.`);
		} catch (error) {
			this.logger.error(`BulkDelete: Error performing bulk deletion: ${error}`);
			throw error;
		}

		// Check if the room metadata file should be deleted
		const roomMetadataToDelete: string[] = [];
		const deleteTasks: Promise<void>[] = [];

		for (const roomId of roomsToCheck) {
			const shouldDeleteRoomMetadata = await this.shouldDeleteRoomMetadata(roomId);

			if (shouldDeleteRoomMetadata) {
				deleteTasks.push(this.storageService.deleteArchivedRoomMetadata(roomId));
				roomMetadataToDelete.push(roomId);
			}
		}

		try {
			this.logger.verbose(`Deleting room_metadata.json for rooms: ${roomMetadataToDelete.join(', ')}`);
			await Promise.all(deleteTasks);
			this.logger.verbose(`BulkDelete: Successfully deleted ${allFilesToDelete.size} room metadata files.`);
		} catch (error) {
			this.logger.error(`BulkDelete: Error performing bulk deletion: ${error}`);
			throw error;
		}

		return { deleted: Array.from(deletedRecordings), notDeleted: Array.from(notDeletedRecordings) };
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
			const metadataPrefix = `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.metadata/${roomId}`;
			const { Contents } = await this.s3Service.listObjectsPaginated(metadataPrefix);

			// If no metadata files exist or the list is empty, the room metadata should be deleted
			return !Contents || Contents.length === 0;
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
	async getAllRecordings({ maxItems, nextPageToken, roomId, fields }: MeetRecordingFilters): Promise<{
		recordings: MeetRecordingInfo[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		try {
			// Construct the room prefix if a room ID is provided
			const roomPrefix = roomId ? `/${roomId}` : '';

			// Retrieve the recordings from the S3 bucket
			const { Contents, IsTruncated, NextContinuationToken } = await this.s3Service.listObjectsPaginated(
				`${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.metadata${roomPrefix}`,
				maxItems,
				nextPageToken
			);

			if (!Contents) {
				this.logger.verbose('No recordings found. Returning an empty array.');
				return { recordings: [], isTruncated: false };
			}

			const promises: Promise<MeetRecordingInfo>[] = [];
			// Retrieve the metadata for each recording
			Contents.forEach((item) => {
				if (item?.Key && item.Key.endsWith('.json') && !item.Key.endsWith('secrets.json')) {
					promises.push(this.s3Service.getObjectAsJson(item.Key) as Promise<MeetRecordingInfo>);
				}
			});

			let recordings: MeetRecordingInfo[] = await Promise.all(promises);

			recordings = recordings.map((rec) => UtilsHelper.filterObjectFields(rec, fields)) as MeetRecordingInfo[];

			this.logger.info(`Retrieved ${recordings.length} recordings.`);
			// Return the paginated list of recordings
			return { recordings, isTruncated: !!IsTruncated, nextPageToken: NextContinuationToken };
		} catch (error) {
			this.logger.error(`Error getting recordings: ${error}`);
			throw error;
		}
	}

	async getRecordingAsStream(
		recordingId: string,
		range?: string
	): Promise<{ fileSize: number | undefined; fileStream: Readable; start?: number; end?: number }> {
		const DEFAULT_RECORDING_FILE_PORTION_SIZE = 5 * 1024 * 1024; // 5MB
		const recordingInfo: MeetRecordingInfo = await this.getRecording(recordingId);

		if (recordingInfo.status !== MeetRecordingStatus.COMPLETE) {
			throw errorRecordingNotStopped(recordingId);
		}

		const recordingPath = `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/${RecordingHelper.extractFilename(recordingInfo)}`;

		if (!recordingPath) throw new Error(`Error extracting path from recording ${recordingId}`);

		const data = await this.s3Service.getHeaderObject(recordingPath);
		const fileSize = data.ContentLength;

		if (!fileSize) {
			this.logger.error(`Error getting file size for recording ${recordingId}`);
			throw internalError(`getting file size for recording '${recordingId}'`);
		}

		if (range) {
			// Parse the range header
			const matches = range.match(/^bytes=(\d+)-(\d*)$/)!;

			const start = parseInt(matches[1], 10);
			let end = matches[2] ? parseInt(matches[2], 10) : start + DEFAULT_RECORDING_FILE_PORTION_SIZE;

			// Validate the range values
			if (isNaN(start) || isNaN(end) || start < 0) {
				this.logger.warn(`Invalid range values for recording ${recordingId}: start=${start}, end=${end}`);
				this.logger.warn(`Returning full stream for recording ${recordingId}`);
				return this.getFullStreamResponse(recordingPath, fileSize);
			}

			if (start >= fileSize) {
				this.logger.error(
					`Invalid range values for recording ${recordingId}: start=${start}, end=${end}, fileSize=${fileSize}`
				);
				throw errorRecordingRangeNotSatisfiable(recordingId, fileSize);
			}

			// Adjust the end value to ensure it doesn't exceed the file size
			end = Math.min(end, fileSize - 1);

			// If the start is greater than the end, return the full stream
			if (start > end) {
				this.logger.warn(`Invalid range values after adjustment: start=${start}, end=${end}`);
				return this.getFullStreamResponse(recordingPath, fileSize);
			}

			const fileStream = await this.s3Service.getObjectAsStream(recordingPath, MEET_S3_BUCKET, {
				start,
				end
			});
			return { fileSize, fileStream, start, end };
		} else {
			return this.getFullStreamResponse(recordingPath, fileSize);
		}
	}

	protected async getFullStreamResponse(
		recordingPath: string,
		fileSize: number
	): Promise<{ fileSize: number; fileStream: Readable }> {
		const fileStream = await this.s3Service.getObjectAsStream(recordingPath, MEET_S3_BUCKET);
		return { fileSize, fileStream };
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
	async acquireRoomRecordingActiveLock(roomId: string): Promise<RedisLock | null> {
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

	/**
	 * Sends a recording signal to OpenVidu Components within a specified room.
	 *
	 * This method constructs a signal with the appropriate topic and payload,
	 * and sends it to the OpenVidu Components in the given room. The payload
	 * is adapted to match the expected format for OpenVidu Components.
	 */
	async sendRecordingSignalToOpenViduComponents(roomId: string, recordingInfo: MeetRecordingInfo) {
		this.logger.debug(`Sending recording signal to OpenVidu Components for room '${roomId}'`);
		const { payload, options } = OpenViduComponentsAdapterHelper.generateRecordingSignal(recordingInfo);

		try {
			await this.roomService.sendSignal(roomId, payload, options);
		} catch (error) {
			this.logger.debug(`Error sending recording signal to OpenVidu Components for room '${roomId}': ${error}`);
		}
	}

	/**
	 * Retrieves the data required to delete a recording, including the file paths
	 * to be deleted and the recording's metadata information.
	 *
	 * @param recordingId - The unique identifier of the recording egress.
	 */
	protected async getDeletableRecordingFiles(
		recordingId: string
	): Promise<{ filesToDelete: Set<string>; recordingInfo: MeetRecordingInfo }> {
		const { metadataFilePath, recordingInfo } = await this.storageService.getRecordingMetadata(recordingId);
		const filesToDelete: Set<string> = new Set();

		// Validate the recording status
		if (!RecordingHelper.canBeDeleted(recordingInfo)) throw errorRecordingNotStopped(recordingId);

		const filename = RecordingHelper.extractFilename(recordingInfo);

		if (!filename) {
			throw internalError(`extracting path from recording '${recordingId}'`);
		}

		const recordingPath = `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/${filename}`;
		filesToDelete.add(recordingPath).add(metadataFilePath);

		return { filesToDelete, recordingInfo };
	}

	// protected async getMeetRecordingInfoFromMetadata(
	// 	recordingId: string
	// ): Promise<{ metadataFilePath: string; recordingInfo: MeetRecordingInfo }> {
	// 	const { roomId, egressId, uid } = RecordingHelper.extractInfoFromRecordingId(recordingId);

	// 	const metadataPath = `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.metadata/${roomId}/${egressId}/${uid}.json`;
	// 	this.logger.debug(`Retrieving metadata for recording ${recordingId} from ${metadataPath}`);
	// 	const recordingInfo = (await this.s3Service.getObjectAsJson(metadataPath)) as MeetRecordingInfo;

	// 	if (!recordingInfo) {
	// 		throw errorRecordingNotFound(recordingId);
	// 	}

	// 	this.logger.verbose(`Retrieved metadata for recording ${recordingId} from ${metadataPath}`);

	// 	return { recordingInfo, metadataFilePath: metadataPath };
	// }

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
	 * Callback function to release the active recording lock after a timeout.
	 * This function is scheduled by the recording cleanup timer when a recording is started.
	 *
	 * @param recordingId
	 * @param roomId
	 */
	protected async handleRecordingLockTimeout(
		recordingId: string,
		roomId: string,
		rejectRequest: (reason?: unknown) => void
	) {
		this.logger.debug(`Recording cleanup timer triggered for room '${roomId}'.`);

		let shouldReleaseLock = false;

		try {
			await this.updateRecordingStatus(recordingId, MeetRecordingStatus.FAILED);
			await this.stopRecording(recordingId);
			// The recording was stopped successfully
			// the cleanup timer will be cancelled when the egress_ended event is received.
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

			// Reject the REST request with a timeout error.
			rejectRequest(errorRecordingStartTimeout(roomId));
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

			// Check each room id if it exists in LiveKit
			// If the room does not exist, release the lock
			for (const roomId of roomIds) {
				await this.evaluateAndReleaseOrphanedLock(roomId, lockPrefix);
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
		const LOCK_GRACE_PERIOD = ms('1m');

		try {
			// Verify if the lock still exists before proceeding to check the room
			const lockExists = await this.mutexService.lockExists(lockKey);

			if (!lockExists) {
				this.logger.debug(`Lock for room ${roomId} no longer exists, skipping cleanup`);
				return;
			}

			// Verify if the lock is too recent
			const createdAt = await this.mutexService.getLockCreatedAt(lockKey);
			const lockAge = Date.now() - (createdAt || Date.now());

			if (lockAge < LOCK_GRACE_PERIOD) {
				this.logger.debug(
					`Lock for room ${roomId} is too recent (${ms(lockAge)}), skipping orphan lock cleanup`
				);
				return;
			}

			const roomExists = await this.livekitService.roomExists(roomId);

			if (roomExists) {
				// Room exists, check if it has publishers
				this.logger.debug(`Room ${roomId} exists, checking for publishers`);
				const room = await this.livekitService.getRoom(roomId);
				const hasPublishers = room.numPublishers > 0;

				if (hasPublishers) {
					// Room has publishers, but no in-progress recordings
					this.logger.debug(`Room ${roomId} has publishers, checking for in-progress recordings`);
				} else {
					// Room has no publishers
					this.logger.debug(`Room ${roomId} has no publishers, checking for in-progress recordings`);
				}
			} else {
				// Room does not exist
				this.logger.debug(`Room ${roomId} no longer exists, checking for in-progress recordings`);
			}

			// Verify if in-progress recordings exist
			const inProgressRecordings = await this.livekitService.getInProgressRecordingsEgress(roomId);
			const hasInProgressRecordings = inProgressRecordings.length > 0;

			if (hasInProgressRecordings) {
				this.logger.debug(`Room ${roomId} has in-progress recordings, skipping cleanup`);
				return;
			}

			this.logger.info(`Room ${roomId} has no in-progress recordings, releasing orphaned lock`);
			await this.mutexService.release(lockKey);
		} catch (error) {
			this.logger.error(`Error processing orphan lock for room ${roomId}:`, error);
			throw error;
		}
	}
}
