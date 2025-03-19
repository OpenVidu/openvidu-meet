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

	async startRecording(roomName: string): Promise<MeetRecordingInfo> {
		let acquiredLock: RedisLock | null = null;

		try {
			// Attempt to acquire lock.
			// Note: using a high TTL to prevent expiration during a long recording.
			acquiredLock = await this.acquireRoomRecordingActiveLock(roomName);

			if (!acquiredLock) throw errorRecordingAlreadyStarted(roomName);

			const room = await this.roomService.getOpenViduRoom(roomName);

			if (!room) throw errorRoomNotFound(roomName);

			const options = this.generateCompositeOptionsFromRequest();
			const output = this.generateFileOutputFromRequest(roomName);
			const egressInfo = await this.livekitService.startRoomComposite(roomName, output, options);

			// Return recording info without releasing the lock here,
			// as it will be released in handleEgressEnded on successful completion.
			return RecordingHelper.toRecordingInfo(egressInfo);
		} catch (error) {
			this.logger.error(`Error starting recording in room ${roomName}: ${error}`);

			if (acquiredLock) await this.releaseRoomRecordingActiveLock(roomName);

			throw error;
		}
	}

	async stopRecording(egressId: string): Promise<MeetRecordingInfo> {
		try {
			const egressArray = await this.livekitService.getActiveEgress(undefined, egressId);

			if (egressArray.length === 0) {
				throw errorRecordingNotFound(egressId);
			}

			const egressInfo = await this.livekitService.stopEgress(egressId);

			return RecordingHelper.toRecordingInfo(egressInfo);
		} catch (error) {
			this.logger.error(`Error stopping recording ${egressId}: ${error}`);
			throw error;
		}
	}

	// TODO: Implement deleteRecording method
	async deleteRecording(egressId: string, role: string): Promise<MeetRecordingInfo> {
		try {
			const { metadataFilePath, recordingInfo } = await this.getMeetRecordingInfoFromMetadata(egressId);

			if (
				recordingInfo.status === MeetRecordingStatus.STARTING ||
				recordingInfo.status === MeetRecordingStatus.ACTIVE ||
				recordingInfo.status === MeetRecordingStatus.ENDING
			) {
				throw errorRecordingNotStopped(egressId);
			}

			const recordingPath = RecordingHelper.extractFilename(recordingInfo);

			if (!recordingPath) throw internalError(`Error extracting path from recording ${egressId}`);

			this.logger.info(`Deleting recording from S3 ${recordingPath}`);

			await Promise.all([
				this.s3Service.deleteObject(metadataFilePath),
				this.s3Service.deleteObject(recordingPath)
			]);

			return recordingInfo;
		} catch (error) {
			this.logger.error(`Error deleting recording ${egressId}: ${error}`);
			throw error;
		}
	}

	// TODO: Implement bulkDeleteRecordings method
	async bulkDeleteRecordings(egressIds: string[], role: string): Promise<MeetRecordingInfo[]> {
		const promises = egressIds.map((egressId) => this.deleteRecording(egressId, role));
		return Promise.all(promises);
	}

	/**
	 * Retrieves the list of all recordings.
	 * @returns A promise that resolves to an array of RecordingInfo objects.
	 */
	//TODO: Implement getAllRecordings method
	async getAllRecordings(): Promise<{ recordingInfo: MeetRecordingInfo[]; continuationToken?: string }> {
		try {
			const allEgress = await this.s3Service.listObjects('.metadata', '.json');
			const promises: Promise<MeetRecordingInfo>[] = [];

			allEgress.Contents?.forEach((item) => {
				if (item?.Key?.includes('.json')) {
					promises.push(this.s3Service.getObjectAsJson(item.Key) as Promise<MeetRecordingInfo>);
				}
			});

			return { recordingInfo: await Promise.all(promises), continuationToken: undefined };
		} catch (error) {
			this.logger.error(`Error getting recordings: ${error}`);
			throw error;
		}
	}

	/**
	 * Retrieves all recordings for a given room.
	 *
	 * @param roomName - The name of the room.
	 * @param roomId - The ID of the room.
	 * @returns A promise that resolves to an array of MeetRecordingInfo objects.
	 * @throws If there is an error retrieving the recordings.
	 */
	//TODO: Implement getAllRecordingsByRoom method
	async getAllRecordingsByRoom(roomName: string, roomId: string): Promise<MeetRecordingInfo[]> {
		try {
			// Get all recordings that match the room name and room ID from the S3 bucket
			const roomNameSanitized = this.sanitizeRegExp(roomName);
			const roomIdSanitized = this.sanitizeRegExp(roomId);
			// Match the room name and room ID in any order
			const regexPattern = `${roomNameSanitized}.*${roomIdSanitized}|${roomIdSanitized}.*${roomNameSanitized}\\.json`;
			const metadatagObject = await this.s3Service.listObjects('.metadata', regexPattern);

			if (!metadatagObject.Contents || metadatagObject.Contents.length === 0) {
				this.logger.verbose(`No recordings found for room ${roomName}. Returning an empty array.`);
				return [];
			}

			const promises: Promise<MeetRecordingInfo>[] = [];
			metadatagObject.Contents?.forEach((item) => {
				promises.push(this.s3Service.getObjectAsJson(item.Key!) as Promise<MeetRecordingInfo>);
			});

			return Promise.all(promises);
		} catch (error) {
			this.logger.error(`Error getting recordings: ${error}`);
			throw error;
		}
	}

	//TODO: Implement getRecording method
	async getRecording(egressId: string): Promise<MeetRecordingInfo> {
		const egressIdSanitized = this.sanitizeRegExp(egressId);
		const regexPattern = `.*${egressIdSanitized}.*\\.json`;
		const metadataObject = await this.s3Service.listObjects('.metadata', regexPattern);

		if (!metadataObject.Contents || metadataObject.Contents.length === 0) {
			throw errorRecordingNotFound(egressId);
		}

		const recording = (await this.s3Service.getObjectAsJson(metadataObject.Contents[0].Key!)) as MeetRecordingInfo;
		return recording;
		// return RecordingHelper.toRecordingInfo(recording);
	}

	//TODO: Implement getRecordingAsStream method
	async getRecordingAsStream(
		recordingId: string,
		range?: string
	): Promise<{ fileSize: number | undefined; fileStream: Readable; start?: number; end?: number }> {
		const RECORDING_FILE_PORTION_SIZE = 5 * 1024 * 1024; // 5MB
		const recordingInfo: MeetRecordingInfo = await this.getRecording(recordingId);
		const recordingPath = RecordingHelper.extractFilename(recordingInfo);

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

	private async getMeetRecordingInfoFromMetadata(
		egressId: string
	): Promise<{ metadataFilePath: string; recordingInfo: MeetRecordingInfo }> {
		// Get the recording object from the S3 bucket
		const metadataObject = await this.s3Service.listObjects('.metadata', `.*${egressId}.*.json`);

		const content = metadataObject.Contents?.[0];

		if (!content) {
			throw errorRecordingNotFound(egressId);
		}

		const metadataPath = content.Key;

		if (!metadataPath) {
			throw errorRecordingNotFound(egressId);
		}

		const recordingInfo = (await this.s3Service.getObjectAsJson(metadataPath)) as MeetRecordingInfo;
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
	private generateFileOutputFromRequest(roomName: string): EncodedFileOutput {
		// Added unique identifier to the file path for avoiding overwriting
		const recordingName = `${roomName}-${uid(10)}`;

		// Generate the file path with the openviud-meet subbucket and the recording prefix
		const filepath = `${MEET_S3_SUBBUCKET}/${MEET_S3_RECORDINGS_PREFIX}/${roomName}/${recordingName}`;

		return new EncodedFileOutput({
			fileType: EncodedFileType.DEFAULT_FILETYPE,
			filepath,
			disableManifest: true
		});
	}

	private sanitizeRegExp(str: string) {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
