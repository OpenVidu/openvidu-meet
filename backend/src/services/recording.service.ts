import { EgressStatus, EncodedFileOutput, EncodedFileType, RoomCompositeOptions } from 'livekit-server-sdk';
import { uid } from 'uid';
import ms from 'ms';
import { Readable } from 'stream';
import { LiveKitService } from './livekit.service.js';
import {
	errorRecordingAlreadyStarted,
	errorRecordingAlreadyStopped,
	errorRecordingCannotBeStoppedWhileStarting,
	errorRecordingNotFound,
	errorRecordingNotStopped,
	errorRoomHasNoParticipants,
	errorRoomNotFound,
	internalError,
	isErrorRecordingAlreadyStopped,
	isErrorRecordingCannotBeStoppedWhileStarting,
	isErrorRecordingNotFound,
	OpenViduMeetError
} from '../models/error.model.js';
import { S3Service } from './s3.service.js';
import { LoggerService } from './logger.service.js';
import { MeetRecordingFilters, MeetRecordingInfo, MeetRecordingStatus } from '@typings-ce';
import { RecordingHelper } from '../helpers/recording.helper.js';
import {
	MEET_RECORDING_LOCK_GC_INTERVAL,
	MEET_RECORDING_LOCK_TTL,
	MEET_RECORDING_STARTED_TIMEOUT,
	MEET_S3_BUCKET,
	MEET_S3_RECORDINGS_PREFIX,
	MEET_S3_SUBBUCKET
} from '../environment.js';
import { RoomService } from './room.service.js';
import { inject, injectable } from '../config/dependency-injector.config.js';
import { MutexService, RedisLock } from './mutex.service.js';
import { OpenViduComponentsAdapterHelper } from '../helpers/ov-components-adapter.helper.js';
import { MeetLock } from '../helpers/redis.helper.js';
import { IScheduledTask, TaskSchedulerService } from './task-scheduler.service.js';
import { SystemEventService } from './system-event.service.js';
import { SystemEventType } from '../models/system-event.model.js';

@injectable()
export class RecordingService {
	constructor(
		@inject(S3Service) protected s3Service: S3Service,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService,
		@inject(SystemEventService) protected systemEventService: SystemEventService,
		@inject(LoggerService) protected logger: LoggerService
	) {
		// Register the recording garbage collector task
		const recordingGarbageCollectorTask: IScheduledTask = {
			name: 'activeRecordingGarbageCollector',
			type: 'cron',
			scheduleOrDelay: MEET_RECORDING_LOCK_GC_INTERVAL,
			callback: this.deleteOrphanLocks.bind(this)
		};
		this.taskSchedulerService.registerTask(recordingGarbageCollectorTask);
	}

	async startRecording(roomId: string): Promise<MeetRecordingInfo> {
		let acquiredLock: RedisLock | null = null;

		try {
			const room = await this.roomService.getMeetRoom(roomId);

			if (!room) throw errorRoomNotFound(roomId);

			//TODO: Check if the room has participants before starting the recording
			//room.numParticipants === 0 ? throw errorNoParticipants(roomId);
			const lkRoom = await this.livekitService.getRoom(roomId);

			if (!lkRoom) throw errorRoomNotFound(roomId);

			if (lkRoom.numParticipants === 0) throw errorRoomHasNoParticipants(roomId);

			// Attempt to acquire lock. If the lock is not acquired, the recording is already active.
			acquiredLock = await this.acquireRoomRecordingActiveLock(roomId);

			if (!acquiredLock) throw errorRecordingAlreadyStarted(roomId);

			const options = this.generateCompositeOptionsFromRequest();
			const output = this.generateFileOutputFromRequest(roomId);
			const egressInfo = await this.livekitService.startRoomComposite(roomId, output, options);
			const recordingInfo = RecordingHelper.toRecordingInfo(egressInfo);
			const { recordingId } = recordingInfo;

			const recordingPromise = new Promise<MeetRecordingInfo>((resolve, reject) => {
				this.taskSchedulerService.registerTask({
					name: `${roomId}_recording_timeout`,
					type: 'timeout',
					scheduleOrDelay: MEET_RECORDING_STARTED_TIMEOUT,
					callback: this.handleRecordingLockTimeout.bind(this, recordingId, roomId, reject)
				});

				this.systemEventService.once(SystemEventType.RECORDING_ACTIVE, (payload: Record<string, unknown>) => {
					// This listener is triggered only for the instance that started the recording.
					// Check if the recording ID matches the one that was started
					const isEventForCurrentRecording =
						payload?.recordingId === recordingId && payload?.roomId === roomId;

					if (isEventForCurrentRecording) {
						this.taskSchedulerService.cancelTask(`${roomId}_recording_timeout`);
						resolve(recordingInfo);
					} else {
						this.logger.error('Received recording active event with mismatched recording ID:', payload);
					}
				});
			});

			return await recordingPromise;
		} catch (error) {
			this.logger.error(`Error starting recording in room '${roomId}': ${error}`);

			if (acquiredLock) await this.releaseRoomRecordingActiveLock(roomId);

			throw error;
		}
	}

	async stopRecording(recordingId: string): Promise<MeetRecordingInfo> {
		try {
			const { roomId, egressId } = RecordingHelper.extractInfoFromRecordingId(recordingId);

			const [egress] = await this.livekitService.getEgress(roomId, egressId);

			if (!egress) {
				throw errorRecordingNotFound(egressId);
			}

			// Cancel the recording cleanup timer if it is running
			this.taskSchedulerService.cancelTask(`${roomId}_recording_timeout`);
			// Remove the listener for the EGRESS_STARTED event.
			this.systemEventService.off(SystemEventType.RECORDING_ACTIVE);

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
	 * Deletes a recording from the S3 bucket based on the provided egress ID.
	 *
	 * The recording is deleted only if it is not in progress state (STARTING, ACTIVE, ENDING).
	 * @param recordingId - The egress ID of the recording.
	 */
	async deleteRecording(recordingId: string): Promise<MeetRecordingInfo> {
		try {
			// Get the recording metada and recording info from the S3 bucket
			const { filesToDelete, recordingInfo } = await this.getDeletableRecordingData(recordingId);

			this.logger.verbose(
				`Deleting recording from S3. Files: ${filesToDelete.join(', ')} for recordingId ${recordingId}`
			);
			await this.s3Service.deleteObjects(filesToDelete);
			this.logger.info(`Deletion successful for recording ${recordingId}`);

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
	async bulkDeleteRecordings(
		recordingIds: string[]
	): Promise<{ deleted: string[]; notDeleted: { recordingId: string; error: string }[] }> {
		const keysToDelete: string[] = [];
		const deletedRecordings: string[] = [];
		const notDeletedRecordings: { recordingId: string; error: string }[] = [];

		for (const recordingId of recordingIds) {
			try {
				const { filesToDelete } = await this.getDeletableRecordingData(recordingId);
				keysToDelete.push(...filesToDelete);
				deletedRecordings.push(recordingId);
				this.logger.verbose(`BulkDelete: Prepared recording ${recordingId} for deletion.`);
			} catch (error) {
				this.logger.error(`BulkDelete: Error processing recording ${recordingId}: ${error}`);
				notDeletedRecordings.push({ recordingId, error: (error as OpenViduMeetError).message });
			}
		}

		if (keysToDelete.length > 0) {
			try {
				await this.s3Service.deleteObjects(keysToDelete);
				this.logger.info(`BulkDelete: Successfully deleted ${keysToDelete.length} objects from S3.`);
			} catch (error) {
				this.logger.error(`BulkDelete: Error performing bulk deletion: ${error}`);
				throw error;
			}
		} else {
			this.logger.warn(`BulkDelete: No eligible recordings found for deletion.`);
		}

		return { deleted: deletedRecordings, notDeleted: notDeletedRecordings };
	}

	/**
	 * Retrieves the recording information for a given recording ID.
	 * @param recordingId - The unique identifier of the recording.
	 * @returns A promise that resolves to a MeetRecordingInfo object.
	 */
	async getRecording(recordingId: string): Promise<MeetRecordingInfo> {
		const { recordingInfo } = await this.getMeetRecordingInfoFromMetadata(recordingId);

		return recordingInfo;
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
	async getAllRecordings({ maxItems, nextPageToken, roomId }: MeetRecordingFilters): Promise<{
		recordings: MeetRecordingInfo[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		try {
			// Construct the room prefix if a room ID is provided
			const roomPrefix = roomId ? `/${roomId}` : '';

			// Retrieve the recordings from the S3 bucket
			const { Contents, IsTruncated, NextContinuationToken } = await this.s3Service.listObjectsPaginated(
				`${MEET_S3_RECORDINGS_PREFIX}/.metadata${roomPrefix}`,
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

			const recordings: MeetRecordingInfo[] = await Promise.all(promises);

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
		const RECORDING_FILE_PORTION_SIZE = 5 * 1024 * 1024; // 5MB
		const recordingInfo: MeetRecordingInfo = await this.getRecording(recordingId);
		const recordingPath = `${MEET_S3_RECORDINGS_PREFIX}/${RecordingHelper.extractFilename(recordingInfo)}`;

		if (!recordingPath) throw new Error(`Error extracting path from recording ${recordingId}`);

		const data = await this.s3Service.getHeaderObject(recordingPath);
		const fileSize = data.ContentLength;

		if (range && fileSize) {
			// Parse the range header
			const parts = range.replace(/bytes=/, '').split('-');
			const start = parseInt(parts[0], 10);
			const endRange = parts[1] ? parseInt(parts[1], 10) : start + RECORDING_FILE_PORTION_SIZE;
			const end = Math.min(endRange, fileSize - 1);
			const fileStream = await this.s3Service.getObjectAsStream(recordingPath, MEET_S3_BUCKET, {
				start,
				end
			});
			return { fileSize, fileStream, start, end };
		} else {
			const fileStream = await this.s3Service.getObjectAsStream(recordingPath);
			return { fileSize, fileStream };
		}
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
			const lock = await this.mutexService.acquire(lockName, ms(MEET_RECORDING_LOCK_TTL));
			return lock;
		} catch (error) {
			this.logger.warn(`Error acquiring lock ${lockName} on egress started: ${error}`);
			return null;
		}
	}

	/**
	 * Releases the active recording lock for a specific room.
	 *
	 * This method attempts to release a lock associated with the active recording
	 * of a given room.
	 */
	async releaseRoomRecordingActiveLock(roomId: string): Promise<void> {
		if (roomId) {
			const lockName = MeetLock.getRecordingActiveLock(roomId);
			const egress = await this.livekitService.getActiveEgress(roomId);

			if (egress.length > 0) {
				this.logger.verbose(
					`Active egress found for room ${roomId}: ${egress.map((e) => e.egressId).join(', ')}`
				);
				this.logger.error(`Cannot release recorgin lock for room '${roomId}'.`);
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
	sendRecordingSignalToOpenViduComponents(roomId: string, recordingInfo: MeetRecordingInfo) {
		const { payload, options } = OpenViduComponentsAdapterHelper.generateRecordingSignal(recordingInfo);
		return this.roomService.sendSignal(roomId, payload, options);
	}

	/**
	 * Retrieves the data required to delete a recording, including the file paths
	 * to be deleted and the recording's metadata information.
	 *
	 * @param recordingId - The unique identifier of the recording egress.
	 */
	protected async getDeletableRecordingData(
		recordingId: string
	): Promise<{ filesToDelete: string[]; recordingInfo: MeetRecordingInfo }> {
		const { metadataFilePath, recordingInfo } = await this.getMeetRecordingInfoFromMetadata(recordingId);
		const filesToDelete: string[] = [metadataFilePath];

		if (
			recordingInfo.status === MeetRecordingStatus.STARTING ||
			recordingInfo.status === MeetRecordingStatus.ACTIVE ||
			recordingInfo.status === MeetRecordingStatus.ENDING
		) {
			throw errorRecordingNotStopped(recordingId);
		}

		const recordingPath = RecordingHelper.extractFilename(recordingInfo);

		if (!recordingPath) {
			throw internalError(`Error extracting path from recording ${recordingId}`);
		}

		filesToDelete.push(recordingPath);

		const secretsFilePath = await this.getSecretsFilePathIfOnlyRemaining(recordingInfo.roomId, metadataFilePath);

		if (secretsFilePath) {
			filesToDelete.push(secretsFilePath);
		}

		return { filesToDelete, recordingInfo };
	}

	protected async getMeetRecordingInfoFromMetadata(
		recordingId: string
	): Promise<{ metadataFilePath: string; recordingInfo: MeetRecordingInfo }> {
		const { roomId, egressId, uid } = RecordingHelper.extractInfoFromRecordingId(recordingId);

		const metadataPath = `${MEET_S3_RECORDINGS_PREFIX}/.metadata/${roomId}/${egressId}/${uid}.json`;
		this.logger.debug(`Retrieving metadata for recording ${recordingId} from ${metadataPath}`);
		const recordingInfo = (await this.s3Service.getObjectAsJson(metadataPath)) as MeetRecordingInfo;

		if (!recordingInfo) {
			throw errorRecordingNotFound(recordingId);
		}

		this.logger.verbose(`Retrieved metadata for recording ${recordingId} from ${metadataPath}`);

		return { recordingInfo, metadataFilePath: metadataPath };
	}

	protected generateCompositeOptionsFromRequest(layout = 'speaker'): RoomCompositeOptions {
		return {
			layout: layout
			// customBaseUrl: customLayout,
			// audioOnly: false,
			// videoOnly: false
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
		const filepath = `${MEET_S3_SUBBUCKET}/${MEET_S3_RECORDINGS_PREFIX}/${roomId}/${recordingName}`;

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
					await this.releaseRoomRecordingActiveLock(roomId);
					this.logger.debug(`Recording active lock released for room ${roomId}.`);
				} catch (releaseError) {
					this.logger.error(`Error releasing active recording lock for room ${roomId}: ${releaseError}`);
				}
			}

			// Reject the REST request with a timeout error.
			rejectRequest(
				new Error(`Timeout waiting for '${SystemEventType.RECORDING_ACTIVE}' event in room '${roomId}'`)
			);
		}
	}

	/**
	 * Checks if the secrets.json file is the only remaining file in a room's metadata directory
	 * (besides the specified metadata file) and returns its path if that's the case.
	 *
	 * This method examines the S3 bucket for the specified room's metadata directory.
	 * It expects to find exactly 2 files (the metadata file and potentially the secrets.json file).
	 */
	protected async getSecretsFilePathIfOnlyRemaining(
		roomId: string,
		metadataFilePath: string
	): Promise<string | null> {
		try {
			// List all objects in the metadata directory for the room
			const { Contents } = await this.s3Service.listObjectsPaginated(
				`${MEET_S3_RECORDINGS_PREFIX}/.metadata/${roomId}`
			);

			// Check if the contents number are valid.
			// If the contents are empty or not exactly 2, return null
			// (one for the metadata file and one for the secrets.json file)
			if (!Contents || Contents.length !== 2) {
				return null;
			}

			// Filter out the metadata file path
			const otherFiles = Contents.filter((item) => (item.Key?.endsWith(metadataFilePath) ? false : true));

			// If the only other file is the secrets.json file, add it to the filesToDelete array
			if (otherFiles.length === 1 && otherFiles[0].Key?.endsWith('secrets.json')) {
				return `${MEET_S3_RECORDINGS_PREFIX}/.metadata/${roomId}/secrets.json`;
			}

			return null;
		} catch (error) {
			return null;
		}
	}

	/**
	 * Cleans up orphaned recording locks in the system.
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
	protected async deleteOrphanLocks(): Promise<void> {
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
				await this.processOrphanLock(roomId, lockPrefix);
			}
		} catch (error) {
			this.logger.error('Error retrieving recording locks:', error);
		}
	}

	/**
	 * Process an orphaned lock by checking if the associated room exists and releasing the lock if necessary.
	 *
	 * @param roomId - The ID of the room associated with the lock.
	 * @param lockPrefix - The prefix used to identify the lock.
	 */
	protected async processOrphanLock(roomId: string, lockPrefix: string): Promise<void> {
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
				// Room does not exist, and no in-progress recordings, release the lock
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
