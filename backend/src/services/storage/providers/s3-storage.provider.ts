import { PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { GlobalPreferences, MeetRecordingInfo, MeetRoom } from '@typings-ce';
import { inject, injectable } from 'inversify';
import INTERNAL_CONFIG from '../../../config/internal-config.js';
import { errorRecordingNotFound, OpenViduMeetError, RedisKeyName } from '../../../models/index.js';
import { LoggerService, RedisService, S3Service, StorageProvider } from '../../index.js';
import { RecordingHelper } from '../../../helpers/recording.helper.js';

/**
 * Implementation of the StorageProvider interface using AWS S3 for persistent storage
 * with Redis caching for improved performance.
 *
 * This class provides operations for storing and retrieving application preferences and room data
 * with a two-tiered storage approach:
 * - Redis is used as a primary cache for fast access
 * - S3 serves as the persistent storage layer and fallback when data is not in Redis
 *
 * The storage operations are performed in parallel to both systems when writing data,
 * with transaction-like rollback behavior if one operation fails.
 *
 * @template GPrefs - Type for global preferences data, defaults to GlobalPreferences
 * @template MRoom - Type for room data, defaults to MeetRoom
 *
 * @implements {StorageProvider}
 */
@injectable()
export class S3StorageProvider<
	GPrefs extends GlobalPreferences = GlobalPreferences,
	MRoom extends MeetRoom = MeetRoom,
	MRec extends MeetRecordingInfo = MeetRecordingInfo
> implements StorageProvider
{
	protected readonly S3_GLOBAL_PREFERENCES_KEY = `global-preferences.json`;
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(S3Service) protected s3Service: S3Service,
		@inject(RedisService) protected redisService: RedisService
	) {}

	/**
	 * Retrieves metadata headers for an object stored in S3.
	 *
	 * @param filePath - The path/key of the file in the S3 bucket
	 * @returns A promise that resolves to an object containing the content length and content type of the file
	 * @throws Will throw an error if the S3 operation fails or the file doesn't exist
	 */
	async getObjectHeaders(filePath: string): Promise<{ contentLength?: number; contentType?: string }> {
		try {
			const data = await this.s3Service.getHeaderObject(filePath);
			return {
				contentLength: data.ContentLength,
				contentType: data.ContentType
			};
		} catch (error) {
			this.logger.error(`Error fetching object headers for ${filePath}: ${error}`);
			throw error;
		}
	}

	/**
	 * Initializes global preferences. If no preferences exist, persists the provided defaults.
	 * If preferences exist but belong to a different project, they are replaced.
	 *
	 * @param defaultPreferences - The default preferences to initialize with.
	 */
	async initialize(defaultPreferences: GPrefs): Promise<void> {
		try {
			const existingPreferences = await this.getGlobalPreferences();

			if (!existingPreferences) {
				this.logger.info('No existing preferences found. Saving default preferences to S3.');
				await this.saveGlobalPreferences(defaultPreferences);
				return;
			}

			this.logger.verbose('Global preferences found. Checking project association...');
			const isDifferentProject = existingPreferences.projectId !== defaultPreferences.projectId;

			if (isDifferentProject) {
				this.logger.warn(
					`Existing global preferences belong to project [${existingPreferences.projectId}], ` +
						`which differs from current project [${defaultPreferences.projectId}]. Replacing preferences.`
				);

				await this.saveGlobalPreferences(defaultPreferences);
				return;
			}

			this.logger.verbose(
				'Global preferences for the current project are already initialized. No action needed.'
			);
		} catch (error) {
			this.logger.error('Error during global preferences initialization:', error);
		}
	}

	/**
	 * Retrieves the global preferences.
	 * First attempts to retrieve from Redis; if not available, falls back to S3.
	 * If fetched from S3, caches the result in Redis.
	 *
	 * @returns A promise that resolves to the global preferences or null if not found.
	 */
	async getGlobalPreferences(): Promise<GPrefs | null> {
		try {
			// Try to get preferences from Redis cache
			let preferences: GPrefs | null = await this.getFromRedis<GPrefs>(RedisKeyName.GLOBAL_PREFERENCES);

			if (!preferences) {
				this.logger.debug('Global preferences not found in Redis. Fetching from S3...');
				preferences = await this.getFromS3<GPrefs>(this.S3_GLOBAL_PREFERENCES_KEY);

				if (preferences) {
					this.logger.verbose('Fetched global preferences from S3. Caching them in Redis.');
					const redisPayload = JSON.stringify(preferences);
					await this.redisService.set(RedisKeyName.GLOBAL_PREFERENCES, redisPayload, false);
				} else {
					this.logger.warn('No global preferences found in S3.');
				}
			} else {
				this.logger.verbose('Global preferences retrieved from Redis.');
			}

			return preferences;
		} catch (error) {
			this.handleError(error, 'Error fetching preferences');
			return null;
		}
	}

	/**
	 * Persists the global preferences to both S3 and Redis in parallel.
	 * Uses Promise.all to execute both operations concurrently.
	 *
	 * @param preferences - Global preferences to store.
	 * @returns The saved preferences.
	 * @throws Rethrows any error if saving fails.
	 */
	async saveGlobalPreferences(preferences: GPrefs): Promise<GPrefs> {
		try {
			const redisPayload = JSON.stringify(preferences);

			await Promise.all([
				this.s3Service.saveObject(this.S3_GLOBAL_PREFERENCES_KEY, preferences),
				this.redisService.set(RedisKeyName.GLOBAL_PREFERENCES, redisPayload, false)
			]);
			this.logger.info('Global preferences saved successfully');
			return preferences;
		} catch (error) {
			this.handleError(error, 'Error saving global preferences');
			throw error;
		}
	}

	/**
	 * Persists a room object to S3 and Redis concurrently.
	 * If at least one operation fails, performs a rollback by deleting the successfully saved object.
	 *
	 * @param meetRoom - The room object to save.
	 * @returns The saved room if both operations succeed.
	 * @throws The error from the first failed operation.
	 */
	async saveMeetRoom(meetRoom: MRoom): Promise<MRoom> {
		const { roomId } = meetRoom;
		const s3Path = `${INTERNAL_CONFIG.S3_ROOMS_PREFIX}/${roomId}/${roomId}.json`;
		const redisPayload = JSON.stringify(meetRoom);
		const redisKey = RedisKeyName.ROOM + roomId;

		const [s3Result, redisResult] = await Promise.allSettled([
			this.s3Service.saveObject(s3Path, meetRoom),
			this.redisService.set(redisKey, redisPayload, false)
		]);

		if (s3Result.status === 'fulfilled' && redisResult.status === 'fulfilled') {
			return meetRoom;
		}

		// Rollback any changes made by the successful operation
		await this.rollbackRoomSave(roomId, s3Result, redisResult, s3Path, redisKey);

		// Return the error that occurred first
		const failedOperation: PromiseRejectedResult =
			s3Result.status === 'rejected' ? s3Result : (redisResult as PromiseRejectedResult);
		const error = failedOperation.reason;
		this.handleError(error, `Error saving Room preferences for room ${roomId}`);
		throw error;
	}

	/**
	 * Retrieves the list of Meet rooms from S3.
	 *
	 * @param maxItems - Maximum number of items to retrieve.
	 * @param nextPageToken - Continuation token for pagination.
	 * @returns An object containing the list of rooms, a flag indicating whether the list is truncated, and, if available, the next page token.
	 */
	async getMeetRooms(
		maxItems: number,
		nextPageToken?: string
	): Promise<{
		rooms: MRoom[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		try {
			const {
				Contents: roomFiles,
				IsTruncated,
				NextContinuationToken
			} = await this.s3Service.listObjectsPaginated(INTERNAL_CONFIG.S3_ROOMS_PREFIX, maxItems, nextPageToken);

			if (!roomFiles || roomFiles.length === 0) {
				this.logger.verbose('No room files found in S3.');
				return { rooms: [], isTruncated: false };
			}

			// Extract room IDs directly and filter out invalid values
			const roomIds = roomFiles
				.map((file) => this.extractRoomId(file.Key))
				.filter((id): id is string => Boolean(id));

			// Fetch and log any room lookup errors individually
			// Fetch room preferences in parallel
			const rooms = await Promise.all(
				roomIds.map(async (roomId) => {
					try {
						return await this.getMeetRoom(roomId);
					} catch (error: unknown) {
						this.logger.warn(`Failed to fetch room "${roomId}": ${error}`);
						return null;
					}
				})
			);

			// Filter out null values
			const validRooms = rooms.filter((room) => room !== null) as MRoom[];
			return { rooms: validRooms, isTruncated: !!IsTruncated, nextPageToken: NextContinuationToken };
		} catch (error) {
			this.handleError(error, 'Error fetching Room preferences');
			return { rooms: [], isTruncated: false };
		}
	}

	async getMeetRoom(roomId: string): Promise<MRoom | null> {
		try {
			// Try to get room preferences from Redis cache
			const room: MRoom | null = await this.getFromRedis<MRoom>(roomId);

			if (!room) {
				const s3RoomPath = `${INTERNAL_CONFIG.S3_ROOMS_PREFIX}/${roomId}/${roomId}.json`;
				this.logger.debug(`Room ${roomId} not found in Redis. Fetching from S3 at ${s3RoomPath}...`);

				return await this.getFromS3<MRoom>(s3RoomPath);
			}

			this.logger.debug(`Room ${roomId} verified in Redis`);
			return room;
		} catch (error) {
			this.handleError(error, `Error fetching Room preferences for room ${roomId}`);
			return null;
		}
	}

	async deleteMeetRooms(roomIds: string[]): Promise<void> {
		const roomsToDelete = roomIds.map((id) => `${INTERNAL_CONFIG.S3_ROOMS_PREFIX}/${id}/${id}.json`);
		const redisKeysToDelete = roomIds.map((id) => RedisKeyName.ROOM + id);

		try {
			await Promise.all([
				this.s3Service.deleteObjects(roomsToDelete),
				this.redisService.delete(redisKeysToDelete)
			]);
			this.logger.verbose(`Rooms deleted successfully: ${roomIds.join(', ')}`);
		} catch (error) {
			this.handleError(error, `Error deleting rooms: ${roomIds.join(', ')}`);
		}
	}

	async getArchivedRoomMetadata(roomId: string): Promise<Partial<MRoom> | null> {
		try {
			const filePath = `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.room_metadata/${roomId}/room_metadata.json`;
			const roomMetadata = await this.getFromS3<Partial<MRoom>>(filePath);

			if (!roomMetadata) {
				this.logger.warn(`Room metadata not found for room ${roomId} in recordings bucket`);
				return null;
			}

			return roomMetadata;
		} catch (error) {
			this.handleError(error, `Error fetching archived room metadata for room ${roomId}`);
			return null;
		}
	}

	/**
	 * Saves room metadata to a JSON file in the S3 bucket if it doesn't already exist.
	 *
	 * This method checks if the metadata file for the given room already exists in the
	 * S3 bucket. If not, it retrieves the room information, extracts the necessary
	 * secrets and preferences, and saves them to a metadata JSON file in the
	 * .room_metadata/{roomId}/ directory of the S3 bucket.
	 *
	 * @param roomId - The unique identifier of the room
	 */
	async archiveRoomMetadata(roomId: string): Promise<void> {
		try {
			const filePath = `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.room_metadata/${roomId}/room_metadata.json`;
			const fileExists = await this.s3Service.exists(filePath);

			if (fileExists) {
				this.logger.debug(`Room metadata already saved for room ${roomId} in recordings bucket`);
				return;
			}

			const room = await this.getMeetRoom(roomId);

			if (room) {
				const roomMetadata = {
					moderatorRoomUrl: room.moderatorRoomUrl,
					publisherRoomUrl: room.publisherRoomUrl,
					preferences: {
						recordingPreferences: room.preferences?.recordingPreferences
					}
				};
				await this.s3Service.saveObject(filePath, roomMetadata);
				this.logger.debug(`Room metadata saved for room ${roomId} in recordings bucket`);
				return;
			}

			this.logger.error(`Error saving room metadata for room ${roomId} in recordings bucket`);
		} catch (error) {
			this.logger.error(`Error saving room metadata for room ${roomId} in recordings bucket: ${error}`);
		}
	}

	/**
	 * Updates the archived room metadata for a given room in the S3 recordings bucket if it exists.
	 *
	 * @param roomId - The unique identifier of the room whose metadata needs to be updated.
	 */
	async updateArchivedRoomMetadata(roomId: string): Promise<void> {
		try {
			const filePath = `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.room_metadata/${roomId}/room_metadata.json`;
			const fileExists = await this.s3Service.exists(filePath);

			if (!fileExists) {
				this.logger.warn(`Room metadata not found for room ${roomId} in recordings bucket`);
				return;
			}

			const room = await this.getMeetRoom(roomId);

			if (room) {
				const roomMetadata = {
					moderatorRoomUrl: room.moderatorRoomUrl,
					publisherRoomUrl: room.publisherRoomUrl,
					preferences: {
						recordingPreferences: room.preferences?.recordingPreferences
					}
				};
				await this.s3Service.saveObject(filePath, roomMetadata);
				this.logger.debug(`Room metadata updated for room ${roomId} in recordings bucket`);
				return;
			}

			this.logger.error(`Error updating room metadata for room ${roomId} in recordings bucket`);
		} catch (error) {
			this.logger.error(`Error updating room metadata for room ${roomId} in recordings bucket: ${error}`);
		}
	}

	async deleteArchivedRoomMetadata(roomId: string): Promise<void> {
		const archivedRoomMetadataPath = `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.room_metadata/${roomId}/room_metadata.json`;

		try {
			await this.s3Service.deleteObjects([archivedRoomMetadataPath]);
			this.logger.verbose(`Archived room metadata deleted for room ${roomId} in recordings bucket`);
		} catch (error) {
			this.logger.error(
				`Error deleting archived room metadata for room ${roomId} in recordings bucket: ${error}`
			);
			this.handleError(error, `Error deleting archived room metadata for room ${roomId}`);
			throw error;
		}
	}

	/**
	 * Deletes multiple recording binary files from S3 storage using their file paths.
	 *
	 * @param recordingPaths - Array of file paths/keys identifying the recording files to delete from S3
	 * @returns A Promise that resolves when all files have been successfully deleted
	 * @throws Will throw an error if the S3 delete operation fails
	 */
	async deleteRecordingBinaryFilesByPaths(recordingPaths: string[]): Promise<void> {
		try {
			await this.s3Service.deleteObjects(recordingPaths);
			this.logger.verbose(`Deleted recording binary files: ${recordingPaths.join(', ')}`);
		} catch (error) {
			this.handleError(error, `Error deleting recording binary files: ${recordingPaths.join(', ')}`);
			throw error;
		}
	}

	async getRecordingMetadata(recordingId: string): Promise<{ recordingInfo: MRec; metadataFilePath: string }> {
		try {
			const metadataPath = RecordingHelper.buildMetadataFilePath(recordingId);
			this.logger.debug(`Retrieving metadata for recording ${recordingId} from ${metadataPath}`);
			const recordingInfo = (await this.s3Service.getObjectAsJson(metadataPath)) as MRec;

			if (!recordingInfo) {
				throw errorRecordingNotFound(recordingId);
			}

			this.logger.verbose(`Retrieved metadata for recording ${recordingId} from ${metadataPath}`);

			return { recordingInfo, metadataFilePath: metadataPath };
		} catch (error) {
			this.handleError(error, `Error fetching recording metadata for recording ${recordingId}`);
			throw error;
		}
	}

	async saveRecordingMetadata(recordingInfo: MRec): Promise<MRec> {
		try {
			const metadataPath = RecordingHelper.buildMetadataFilePath(recordingInfo.recordingId);
			await this.s3Service.saveObject(metadataPath, recordingInfo);
			return recordingInfo;
		} catch (error) {
			this.handleError(error, `Error saving recording metadata for recording ${recordingInfo.recordingId}`);
			throw error;
		}
	}

	/**
	 * Deletes multiple recording metadata files from S3 storage based on their file paths.
	 *
	 * @param metadataPaths - Array of file paths pointing to the metadata files to be deleted
	 * @returns A promise that resolves when all metadata files have been successfully deleted
	 * @throws May throw an error if any of the deletion operations fail
	 */
	async deleteRecordingMetadataByPaths(metadataPaths: string[]): Promise<void> {
		try {
			await this.s3Service.deleteObjects(metadataPaths);
			this.logger.verbose(`Deleted multiple recording metadata files: ${metadataPaths.join(', ')}`);
		} catch (error) {
			this.handleError(error, `Error deleting multiple recording metadata files: ${metadataPaths.join(', ')}`);
			throw error;
		}
	}

	/**
	 * Retrieves an object of type U from Redis by the given key.
	 * Returns null if the key is not found or an error occurs.
	 *
	 * @param key - The Redis key to fetch.
	 * @returns A promise that resolves to an object of type U or null.
	 */
	protected async getFromRedis<U>(key: string): Promise<U | null> {
		try {
			const response = await this.redisService.get(key);

			if (response) {
				return JSON.parse(response) as U;
			}

			return null;
		} catch (error) {
			this.logger.error(`Error fetching from Redis for key ${key}: ${error}`);
			return null;
		}
	}

	/**
	 * Retrieves an object of type U from S3 at the specified path.
	 * Returns null if the object is not found.
	 *
	 * @param path - The S3 key or path to fetch.
	 * @returns A promise that resolves to an object of type U or null.
	 */
	protected async getFromS3<U>(path: string): Promise<U | null> {
		try {
			const response = await this.s3Service.getObjectAsJson(path);

			if (response) {
				this.logger.verbose(`Object found in S3 at path: ${path}`);
				return response as U;
			}

			return null;
		} catch (error) {
			this.logger.error(`Error fetching from S3 for path ${path}: ${error}`);
			return null;
		}
	}

	/**
	 * Extracts the room ID from the given S3 file path.
	 * Assumes the room ID is the directory name immediately preceding the file name.
	 * Example: 'path/to/roomId/file.json' -> 'roomId'
	 *
	 * @param filePath - The S3 object key representing the file path.
	 * @returns The extracted room ID or null if extraction fails.
	 */
	protected extractRoomId(filePath?: string): string | null {
		if (!filePath) return null;

		const parts = filePath.split('/');
		const roomId = parts.slice(-2, -1)[0];

		if (!roomId) {
			this.logger.warn(`Invalid room file path: ${filePath}`);
			return null;
		}

		return roomId;
	}

	/**
	 * Performs rollback of saved room data.
	 *
	 * @param roomId - The room identifier.
	 * @param s3Result - The result of the S3 save operation.
	 * @param redisResult - The result of the Redis set operation.
	 * @param s3Path - The S3 key used to save the room data.
	 * @param redisKey - The Redis key used to cache the room data.
	 */
	protected async rollbackRoomSave(
		roomId: string,
		s3Result: PromiseSettledResult<PutObjectCommandOutput>,
		redisResult: PromiseSettledResult<string>,
		s3Path: string,
		redisKey: string
	): Promise<void> {
		if (s3Result.status === 'fulfilled') {
			try {
				await this.s3Service.deleteObjects([s3Path]);
			} catch (rollbackError) {
				this.logger.error(`Error rolling back S3 save for room ${roomId}: ${rollbackError}`);
			}
		}

		if (redisResult.status === 'fulfilled') {
			try {
				await this.redisService.delete(redisKey);
			} catch (rollbackError) {
				this.logger.error(`Error rolling back Redis set for room ${roomId}: ${rollbackError}`);
			}
		}
	}

	protected handleError(error: unknown, message: string) {
		if (error instanceof OpenViduMeetError) {
			this.logger.error(`${message}: ${error.message}`);
		} else {
			this.logger.error(`${message}: Unexpected error`);
		}
	}
}
