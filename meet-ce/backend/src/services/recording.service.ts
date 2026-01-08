import {
	MeetRecordingFilters,
	MeetRecordingInfo,
	MeetRecordingStatus,
	MeetRoom,
	MeetRoomConfig
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { EgressStatus, EncodedFileOutput, EncodedFileType, RoomCompositeOptions } from 'livekit-server-sdk';
import ms from 'ms';
import { Readable } from 'stream';
import { uid } from 'uid';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { RecordingHelper } from '../helpers/recording.helper.js';
import { MeetLock } from '../helpers/redis.helper.js';
import { DistributedEventType } from '../models/distributed-event.model.js';
import {
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
} from '../models/error.model.js';
import { RecordingRepository } from '../repositories/recording.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { DistributedEventService } from './distributed-event.service.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { MutexService, RedisLock } from './mutex.service.js';
import { BlobStorageService } from './storage/blob-storage.service.js';

@injectable()
export class RecordingService {
	constructor(
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(DistributedEventService) protected systemEventService: DistributedEventService,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(RecordingRepository) protected recordingRepository: RecordingRepository,
		@inject(BlobStorageService) protected blobStorageService: BlobStorageService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(LoggerService) protected logger: LoggerService
	) {}

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

			const room = await this.validateRoomForStartRecording(roomId);

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
					const options = this.generateCompositeOptionsFromRequest(room.config);
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
	 * Retrieves a paginated list of all recordings stored in MongoDB.
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
			const response = await this.recordingRepository.find(filters);
			this.logger.info(`Retrieved ${response.recordings.length} recordings.`);
			return response;
		} catch (error) {
			this.logger.error(`Error getting recordings: ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes multiple recordings in bulk from MongoDB and blob storage.
	 * For each provided recordingId, the metadata and recording file are deleted (only if the status is stopped).
	 *
	 * @param recordingIds Array of recording identifiers.
	 * @param roomId Optional room identifier to delete only recordings from a specific room.
	 * @returns An object containing:
	 * - `deleted`: An array of successfully deleted recording IDs.
	 * - `notDeleted`: An array of objects containing recording IDs and error messages for those that could not be deleted.
	 */
	async bulkDeleteRecordings(
		recordingIds: string[],
		roomId?: string
	): Promise<{ deleted: string[]; failed: { recordingId: string; error: string }[] }> {
		const validRecordingIds: Set<string> = new Set<string>();
		const deletedRecordings: Set<string> = new Set<string>();
		const failedRecordings: Set<{ recordingId: string; error: string }> = new Set();

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
				// Check if the recording exists and can be deleted
				const recordingInfo = await this.recordingRepository.findByRecordingId(recordingId);

				if (!recordingInfo) {
					throw errorRecordingNotFound(recordingId);
				}

				if (!RecordingHelper.canBeDeleted(recordingInfo)) {
					throw errorRecordingNotStopped(recordingId);
				}

				validRecordingIds.add(recordingId);
				deletedRecordings.add(recordingId);
			} catch (error) {
				this.logger.error(`BulkDelete: Error processing recording '${recordingId}': ${error}`);
				failedRecordings.add({ recordingId, error: (error as OpenViduMeetError).message });
			}
		}

		if (validRecordingIds.size === 0) {
			this.logger.warn(`BulkDelete: No eligible recordings found for deletion.`);
			return { deleted: Array.from(deletedRecordings), failed: Array.from(failedRecordings) };
		}

		// Delete recordings metadata from MongoDB and media files from blob storage
		try {
			await Promise.all([
				this.recordingRepository.deleteByRecordingIds(Array.from(validRecordingIds)),
				this.blobStorageService.deleteRecordingMediaBatch(Array.from(validRecordingIds))
			]);
			this.logger.info(`BulkDelete: Successfully deleted ${validRecordingIds.size} recordings.`);
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

				const { failed } = await this.bulkDeleteRecordings(remainingRecordings, roomId);

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
		const recordings = await this.recordingRepository.findAllByRoomId(roomId);
		const recordingIds = recordings.map((recording) => recording.recordingId);
		return recordingIds;
	}

	/**
	 * Retrieves the recording information for a given recording ID.
	 * @param recordingId - The unique identifier of the recording.
	 * @returns A promise that resolves to a MeetRecordingInfo object.
	 */
	async getRecording(recordingId: string, fields?: string): Promise<MeetRecordingInfo> {
		const recordingInfo = await this.recordingRepository.findByRecordingId(recordingId, fields);

		if (!recordingInfo) {
			throw errorRecordingNotFound(recordingId);
		}

		return recordingInfo;
	}

	/**
	 * Retrieves the access secrets for a specific recording.
	 *
	 * @param recordingId - The unique identifier of the recording
	 * @returns A promise that resolves to an object containing the public and private access secrets
	 * @throws Will throw an error if the recording is not found
	 */
	async getRecordingAccessSecrets(
		recordingId: string
	): Promise<{ publicAccessSecret: string; privateAccessSecret: string }> {
		const recordingSecrets = await this.recordingRepository.findAccessSecretsByRecordingId(recordingId);

		if (!recordingSecrets) {
			throw errorRecordingNotFound(recordingId);
		}

		return recordingSecrets;
	}

	/**
	 * Deletes a recording and its associated metadata from MongoDB and blob storage.
	 *
	 * @param recordingId - The unique identifier of the recording to delete.
	 * @returns The recording information that was deleted.
	 */
	async deleteRecording(recordingId: string): Promise<MeetRecordingInfo> {
		try {
			// Get the recording metadata from MongoDB
			const recordingInfo = await this.recordingRepository.findByRecordingId(recordingId);

			if (!recordingInfo) {
				throw errorRecordingNotFound(recordingId);
			}

			// Validate the recording status
			if (!RecordingHelper.canBeDeleted(recordingInfo)) throw errorRecordingNotStopped(recordingId);

			// Delete recording metadata from MongoDB and media file from blob storage
			await Promise.all([
				this.recordingRepository.deleteByRecordingId(recordingId),
				this.blobStorageService.deleteRecordingMedia(recordingId)
			]);

			this.logger.info(`Successfully deleted recording ${recordingId}`);

			return recordingInfo;
		} catch (error) {
			this.logger.error(`Error deleting recording ${recordingId}: ${error}`);
			throw error;
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

		return this.blobStorageService.getRecordingMedia(recordingId, validatedRange);
	}

	async updateRecordingStatus(recordingId: string, status: MeetRecordingStatus): Promise<void> {
		const recordingInfo = await this.getRecording(recordingId);
		recordingInfo.status = status;
		await this.recordingRepository.update(recordingInfo);
	}

	/**
	 * Helper method to check if a room has recordings
	 *
	 * @param roomId - The ID of the room to check
	 * @returns A promise that resolves to true if the room has recordings, false otherwise
	 */
	async hasRoomRecordings(roomId: string): Promise<boolean> {
		try {
			const response = await this.recordingRepository.find({
				roomId,
				maxItems: 1
			});
			return response.recordings.length > 0;
		} catch (error) {
			this.logger.warn(`Error checking recordings for room '${roomId}': ${error}`);
			return false;
		}
	}

	/**
	 * Validates that a room exists and has participants before starting a recording.
	 *
	 * @param roomId
	 * @returns The MeetRoom object if validation passes.
	 * @throws Will throw an error if the room does not exist or has no participants.
	 */
	protected async validateRoomForStartRecording(roomId: string): Promise<MeetRoom> {
		const room = await this.roomRepository.findByRoomId(roomId);

		if (!room) throw errorRoomNotFound(roomId);

		const hasParticipants = await this.livekitService.roomHasParticipants(roomId);

		if (!hasParticipants) throw errorRoomHasNoParticipants(roomId);

		return room;
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
			const lock = await this.mutexService.acquire(lockName, ms(INTERNAL_CONFIG.RECORDING_ACTIVE_LOCK_TTL));
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
					error: `No egress service was able to register a request. Check your CPU usage or if there's any Media Node with enough CPU. Remember that by default, composite recording uses 2 CPUs for each room.`
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

	/**
	 * Generates composite options for recording based on the provided room configuration.
	 *
	 * @param roomConfig  The room configuration
	 * @returns The generated RoomCompositeOptions object.
	 */
	protected generateCompositeOptionsFromRequest({ recording }: MeetRoomConfig): RoomCompositeOptions {
		return {
			layout: recording.layout
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
		const filepath = `${MEET_ENV.S3_SUBBUCKET}/recordings/${roomId}/${recordingName}`;

		return new EncodedFileOutput({
			fileType: EncodedFileType.DEFAULT_FILETYPE,
			filepath,
			disableManifest: true
		});
	}
}
