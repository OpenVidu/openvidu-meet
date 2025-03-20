import { EncodedFileOutput, EncodedFileType, RoomCompositeOptions } from 'livekit-server-sdk';
import { uid } from 'uid';
import { Readable } from 'stream';
import { LiveKitService } from './livekit.service.js';
import {
	errorRecordingAlreadyStarted,
	errorRecordingNotFound,
	errorRecordingNotStopped,
	errorRoomNotFound,
	internalError
} from '../models/error.model.js';
import { S3Service } from './s3.service.js';
import { LoggerService } from './logger.service.js';
import { MeetRecordingInfo, MeetRecordingStatus } from '@typings-ce';
import { RecordingHelper } from '../helpers/recording.helper.js';
import { MEET_S3_BUCKET, MEET_S3_RECORDINGS_PREFIX, MEET_S3_SUBBUCKET } from '../environment.js';
import { RoomService } from './room.service.js';
import { inject, injectable } from '../config/dependency-injector.config.js';
import { MutexService, RedisLock } from './mutex.service.js';
import { RedisLockName } from '../models/index.js';
import ms from 'ms';
import { OpenViduComponentsAdapterHelper } from '../helpers/ov-components-adapter.helper.js';

type GetAllRecordingsParams = {
	maxItems?: number;
	nextPageToken?: string;
	roomId?: string;
	status?: string;
};

@injectable()
export class RecordingService {
	protected readonly RECORDING_ACTIVE_LOCK_TTL = ms('6h');
	constructor(
		@inject(S3Service) protected s3Service: S3Service,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(LoggerService) protected logger: LoggerService
	) {}

	async startRecording(roomId: string): Promise<MeetRecordingInfo> {
		let acquiredLock: RedisLock | null = null;

		try {
			// Attempt to acquire lock.
			// Note: using a high TTL to prevent expiration during a long recording.
			acquiredLock = await this.acquireRoomRecordingActiveLock(roomId);

			if (!acquiredLock) throw errorRecordingAlreadyStarted(roomId);

			const room = await this.roomService.getOpenViduRoom(roomId);

			if (!room) throw errorRoomNotFound(roomId);

			const options = this.generateCompositeOptionsFromRequest();
			const output = this.generateFileOutputFromRequest(roomId);
			const egressInfo = await this.livekitService.startRoomComposite(roomId, output, options);

			// Return recording info without releasing the lock here,
			// as it will be released in handleEgressEnded on successful completion.
			return RecordingHelper.toRecordingInfo(egressInfo);
		} catch (error) {
			this.logger.error(`Error starting recording in room ${roomId}: ${error}`);

			if (acquiredLock) await this.releaseRoomRecordingActiveLock(roomId);

			throw error;
		}
	}

	async stopRecording(recordingId: string): Promise<MeetRecordingInfo> {
		try {
			const { roomId, egressId } = RecordingHelper.extractInfoFromRecordingId(recordingId);

			const egressArray = await this.livekitService.getActiveEgress(roomId, egressId);

			if (egressArray.length === 0) {
				throw errorRecordingNotFound(egressId);
			}

			const egressInfo = await this.livekitService.stopEgress(egressId);

			return RecordingHelper.toRecordingInfo(egressInfo);
		} catch (error) {
			this.logger.error(`Error stopping recording ${recordingId}: ${error}`);
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
	 * @param egressIds Array of recording identifiers.
	 * @returns An array with the MeetRecordingInfo of the successfully deleted recordings.
	 */
	async bulkDeleteRecordings(egressIds: string[]): Promise<MeetRecordingInfo[]> {
		const keysToDelete: string[] = [];
		const deletedRecordings: MeetRecordingInfo[] = [];

		for (const egressId of egressIds) {
			try {
				const { filesToDelete, recordingInfo } = await this.getDeletableRecordingData(egressId);
				keysToDelete.push(...filesToDelete);
				deletedRecordings.push(recordingInfo);
				this.logger.verbose(`BulkDelete: Prepared recording ${egressId} for deletion.`);
			} catch (error) {
				this.logger.error(`BulkDelete: Error processing recording ${egressId}: ${error}`);
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

		return deletedRecordings;
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
	async getAllRecordings({ maxItems, nextPageToken, roomId, status }: GetAllRecordingsParams): Promise<{
		recordings: MeetRecordingInfo[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		try {
			const roomPrefix = roomId ? `/${roomId}` : '';
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
			Contents.forEach((item) => {
				if (item?.Key && item.Key.endsWith('.json')) {
					promises.push(this.s3Service.getObjectAsJson(item.Key) as Promise<MeetRecordingInfo>);
				}
			});

			let recordings: MeetRecordingInfo[] = await Promise.all(promises);

			if (status) {
				// Filter recordings by status
				const statusArray = status
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
					.map((s) => new RegExp(this.sanitizeRegExp(s)));


				recordings = recordings.filter((recording) =>
					statusArray.some((regex) => regex.test(recording.status))
				);
			}

			this.logger.info(`Retrieved ${recordings.length} recordings.`);

			return { recordings, isTruncated: !!IsTruncated, nextPageToken: NextContinuationToken };
		} catch (error) {
			this.logger.error(`Error getting recordings: ${error}`);
			throw error;
		}
	}

	//TODO: Implement getRecordingAsStream method
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
	 */
	async acquireRoomRecordingActiveLock(roomName: string): Promise<RedisLock | null> {
		const lockName = `${roomName}_${RedisLockName.RECORDING_ACTIVE}`;

		try {
			const lock = await this.mutexService.acquire(lockName, this.RECORDING_ACTIVE_LOCK_TTL);
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
	async releaseRoomRecordingActiveLock(roomName: string): Promise<void> {
		if (roomName) {
			const lockName = `${roomName}_${RedisLockName.RECORDING_ACTIVE}`;

			try {
				await this.mutexService.release(lockName);
			} catch (error) {
				this.logger.warn(`Error releasing lock ${lockName} on egress ended: ${error}`);
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
	sendRecordingSignalToOpenViduComponents(roomName: string, recordingInfo: MeetRecordingInfo) {
		const { payload, options } = OpenViduComponentsAdapterHelper.generateRecordingSignal(recordingInfo);
		return this.roomService.sendSignal(roomName, payload, options);
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

		return { filesToDelete: [metadataFilePath, recordingPath], recordingInfo };
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

	private generateCompositeOptionsFromRequest(layout = 'speaker'): RoomCompositeOptions {
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
	private generateFileOutputFromRequest(roomId: string): EncodedFileOutput {
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
	private sanitizeRegExp(str: string) {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
