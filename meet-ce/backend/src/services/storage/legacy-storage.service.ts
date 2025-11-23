import { GlobalConfig, MeetApiKey, MeetRecordingInfo, MeetRoom, MeetUser } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { OpenViduMeetError } from '../../models/error.model.js';
import { RedisKeyName } from '../../models/redis.model.js';
import { LoggerService } from '../logger.service.js';
import { RedisService } from '../redis.service.js';
import { StorageFactory } from './storage.factory.js';
import { StorageKeyBuilder, StorageProvider } from './storage.interface.js';

/**
 * Legacy storage service for reading and migrating data from S3/ABS/GCS to MongoDB.
 *
 * This service is used during the migration process to:
 * - Read existing data from legacy storage (S3/Azure Blob Storage/Google Cloud Storage)
 * - Access data cached in Redis that originated from legacy storage
 * - Clean up legacy data after successful migration to MongoDB
 *
 * **Important**: This service is read-only for migration purposes. New data should be
 * created directly in MongoDB using the appropriate repositories (RoomRepository,
 * RecordingRepository, UserRepository, etc.).
 *
 * Legacy storage structure:
 * - Rooms: Stored as JSON files in blob storage with Redis cache
 * - Recordings: Metadata as JSON files, binary media as separate blob files
 * - Users: Stored as JSON files with Redis cache
 * - API Keys: Stored as JSON files with Redis cache
 * - Global Config: Stored as JSON files with Redis cache
 */
@injectable()
export class LegacyStorageService {
	protected storageProvider: StorageProvider;
	protected keyBuilder: StorageKeyBuilder;

	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(StorageFactory) protected storageFactory: StorageFactory,
		@inject(RedisService) protected redisService: RedisService
	) {
		const { provider, keyBuilder } = this.storageFactory.create();
		this.storageProvider = provider;
		this.keyBuilder = keyBuilder;
	}

	// ==========================================
	// GLOBAL CONFIG DOMAIN LOGIC
	// ==========================================

	/**
	 * Retrieves the global configuration from legacy storage.
	 *
	 * @returns A promise that resolves to the global configuration, or null if not found
	 */
	async getGlobalConfig(): Promise<GlobalConfig | null> {
		const redisKey = RedisKeyName.GLOBAL_CONFIG;
		const storageKey = this.keyBuilder.buildGlobalConfigKey();

		const config = await this.getFromCacheAndStorage<GlobalConfig>(redisKey, storageKey);
		return config;
	}

	/**
	 * Deletes the global configuration from legacy storage.
	 */
	async deleteGlobalConfig(): Promise<void> {
		const redisKey = RedisKeyName.GLOBAL_CONFIG;
		const storageKey = this.keyBuilder.buildGlobalConfigKey();

		await this.deleteFromCacheAndStorage(redisKey, storageKey);
	}

	// ==========================================
	// ROOM DOMAIN LOGIC
	// ==========================================

	/**
	 * Retrieves a paginated list of rooms from legacy storage.
	 *
	 * @param maxItems - Optional maximum number of rooms to retrieve per page
	 * @param nextPageToken - Optional token for pagination to get the next set of results
	 * @returns Promise that resolves to an object containing:
	 *   - rooms: Array of MRoom objects retrieved from storage
	 *   - isTruncated: Boolean indicating if there are more results available
	 *   - nextPageToken: Optional token for retrieving the next page of results
	 */
	async getRooms(
		roomName?: string,
		maxItems?: number,
		nextPageToken?: string
	): Promise<{
		rooms: MeetRoom[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		try {
			const searchKey = this.keyBuilder.buildAllMeetRoomsKey(roomName);
			const { Contents, IsTruncated, NextContinuationToken } = await this.storageProvider.listObjects(
				searchKey,
				maxItems,
				nextPageToken
			);

			const rooms: MeetRoom[] = [];

			if (Contents && Contents.length > 0) {
				const roomPromises = Contents.map(async (item) => {
					if (item.Key && item.Key.endsWith('.json')) {
						try {
							const room = await this.storageProvider.getObject<MeetRoom>(item.Key);
							return room;
						} catch (error) {
							this.logger.warn(`Failed to load room from ${item.Key}: ${error}`);
							return null;
						}
					}

					return null;
				});

				const roomResults = await Promise.all(roomPromises);
				rooms.push(...roomResults.filter((room): room is Awaited<MeetRoom> => room !== null));
			}

			return {
				rooms,
				isTruncated: IsTruncated || false,
				nextPageToken: NextContinuationToken
			};
		} catch (error) {
			this.handleError(error, 'Error retrieving rooms');
			throw error;
		}
	}

	/**
	 * Deletes multiple rooms by roomIds from legacy storage.
	 *
	 * @param roomIds - Array of room identifiers to delete
	 */
	async deleteRooms(roomIds: string[]): Promise<void> {
		const roomKeys = roomIds.map((roomId) => this.keyBuilder.buildMeetRoomKey(roomId));
		const redisKeys = roomIds.map((roomId) => RedisKeyName.ROOM + roomId);

		await this.deleteFromCacheAndStorageBatch(redisKeys, roomKeys);
	}

	/**
	 * Deletes archived room metadata for a given roomId from legacy storage.
	 *
	 * @param roomId - The unique room identifier
	 */
	async deleteArchivedRoomMetadata(roomId: string): Promise<void> {
		const redisKey = RedisKeyName.ARCHIVED_ROOM + roomId;
		const storageKey = this.keyBuilder.buildArchivedMeetRoomKey(roomId);

		await this.deleteFromCacheAndStorage(redisKey, storageKey);
	}

	// ==========================================
	// RECORDING DOMAIN LOGIC
	// ==========================================

	/**
	 * Retrieves a paginated list of recordings from legacy storage
	 *
	 * @param maxItems - Optional maximum number of items to return per page for pagination.
	 * @param nextPageToken - Optional token for pagination to retrieve the next page of results.
	 *
	 * @returns A promise that resolves to an object containing:
	 *   - `recordings`: Array of recording metadata objects (MRec)
	 *   - `isTruncated`: Optional boolean indicating if there are more results available
	 *   - `nextContinuationToken`: Optional token to retrieve the next page of results
	 */
	async getRecordings(
		roomId?: string,
		maxItems?: number,
		nextPageToken?: string
	): Promise<{ recordings: MeetRecordingInfo[]; isTruncated?: boolean; nextContinuationToken?: string }> {
		try {
			const searchKey = this.keyBuilder.buildAllMeetRecordingsKey(roomId);
			const { Contents, IsTruncated, NextContinuationToken } = await this.storageProvider.listObjects(
				searchKey,
				maxItems,
				nextPageToken
			);

			const recordings: MeetRecordingInfo[] = [];

			if (Contents && Contents.length > 0) {
				const recordingPromises = Contents.map(async (item) => {
					if (!item.Key || !item.Key.endsWith('.json')) {
						return null;
					}

					try {
						const recording = await this.storageProvider.getObject<MeetRecordingInfo>(item.Key!);
						return recording;
					} catch (error) {
						this.logger.warn(`Failed to load recording metadata from ${item.Key}: ${error}`);
						return null;
					}
				});

				const recordingResults = await Promise.all(recordingPromises);
				recordings.push(
					...recordingResults.filter(
						(recording): recording is Awaited<MeetRecordingInfo> => recording !== null
					)
				);
			}

			return {
				recordings: recordings,
				isTruncated: Boolean(IsTruncated),
				nextContinuationToken: NextContinuationToken
			};
		} catch (error) {
			this.handleError(error, 'Error retrieving recordings');
			throw error;
		}
	}

	/**
	 * Retrieves access secrets for a specific recording from legacy storage.
	 *
	 * @param recordingId - The unique identifier of the recording
	 * @returns A promise that resolves to an object containing public and private access secrets,
	 *          or null if no secrets are found for the given recordingId
	 */
	async getRecordingAccessSecrets(
		recordingId: string
	): Promise<{ publicAccessSecret: string; privateAccessSecret: string } | null> {
		try {
			const redisKey = RedisKeyName.RECORDING_SECRETS + recordingId;
			const secretsKey = this.keyBuilder.buildAccessRecordingSecretsKey(recordingId);

			const secrets = await this.getFromCacheAndStorage<{
				publicAccessSecret: string;
				privateAccessSecret: string;
			}>(redisKey, secretsKey);

			if (!secrets) {
				this.logger.warn(`No access secrets found for recording ${recordingId}`);
				return null;
			}

			return secrets;
		} catch (error) {
			this.handleError(error, `Error fetching access secrets for recording ${recordingId}`);
			throw error;
		}
	}

	/**
	 * Deletes multiple recordings by recordingIds from legacy storage.
	 *
	 * @param recordingIds - Array of recording identifiers to delete
	 */
	async deleteRecordings(recordingIds: string[]): Promise<void> {
		if (recordingIds.length === 0) {
			this.logger.debug('No recordings to delete');
			return;
		}

		try {
			// Build all paths from recordingIds
			const redisKeys: string[] = [];
			const storageKeys: string[] = [];

			for (const recordingId of recordingIds) {
				redisKeys.push(RedisKeyName.RECORDING + recordingId);
				redisKeys.push(RedisKeyName.RECORDING_SECRETS + recordingId);

				storageKeys.push(this.keyBuilder.buildMeetRecordingKey(recordingId));
				storageKeys.push(this.keyBuilder.buildAccessRecordingSecretsKey(recordingId));
			}

			await this.deleteFromCacheAndStorageBatch(redisKeys, storageKeys);
		} catch (error) {
			this.handleError(error, `Error deleting recordings: ${recordingIds.join(', ')}`);
			throw error;
		}
	}

	// ==========================================
	// USER DOMAIN LOGIC
	// ==========================================

	/**
	 * Retrieves user data for a specific username from legacy storage.
	 *
	 * @param username - The username of the user to retrieve
	 * @returns A promise that resolves to the user data, or null if not found
	 */
	async getUser(username: string): Promise<MeetUser | null> {
		const redisKey = RedisKeyName.USER + username;
		const storageKey = this.keyBuilder.buildUserKey(username);

		const user = await this.getFromCacheAndStorage<MeetUser>(redisKey, storageKey);
		return user;
	}

	/**
	 * Deletes user data for a specific username from legacy storage.
	 *
	 * @param username - The username of the user to delete
	 */
	async deleteUser(username: string): Promise<void> {
		const redisKey = RedisKeyName.USER + username;
		const storageKey = this.keyBuilder.buildUserKey(username);

		await this.deleteFromCacheAndStorage(redisKey, storageKey);
	}

	// ==========================================
	// API KEY DOMAIN LOGIC
	// ==========================================

	/**
	 * Retrieves all API keys from legacy storage.
	 *
	 * @returns A promise that resolves to an array of MeetApiKey objects
	 */
	async getApiKeys(): Promise<MeetApiKey[]> {
		const redisKey = RedisKeyName.API_KEYS;
		const storageKey = this.keyBuilder.buildApiKeysKey();

		const apiKeys = await this.getFromCacheAndStorage<MeetApiKey[]>(redisKey, storageKey);

		if (!apiKeys) {
			return [];
		}

		return apiKeys;
	}

	/**
	 * Deletes all API keys from legacy storage.
	 */
	async deleteApiKeys(): Promise<void> {
		const redisKey = RedisKeyName.API_KEYS;
		const storageKey = this.keyBuilder.buildApiKeysKey();

		await this.deleteFromCacheAndStorage(redisKey, storageKey);
	}

	// ==========================================
	// PRIVATE HYBRID CACHE METHODS (Redis + Storage)
	// ==========================================

	/**
	 * Retrieves data from Redis cache first, falls back to storage if not found.
	 *
	 * @param redisKey - The Redis key to check first
	 * @param storageKey - The storage key/path as fallback
	 * @returns Promise that resolves with the data or null if not found
	 */
	protected async getFromCacheAndStorage<T>(redisKey: string, storageKey: string): Promise<T | null> {
		try {
			// 1. Try Redis first (fast cache)
			this.logger.debug(`Attempting to get data from Redis cache: ${redisKey}`);
			const cachedData = await this.redisService.get(redisKey);

			if (cachedData) {
				this.logger.debug(`Cache HIT for key: ${redisKey}`);

				try {
					return JSON.parse(cachedData) as T;
				} catch (parseError) {
					this.logger.warn(`Failed to parse cached data for key ${redisKey}: ${parseError}`);
					// Continue to storage fallback
				}
			} else {
				this.logger.debug(`Cache MISS for key: ${redisKey}`);
			}

			// 2. Fallback to persistent storage
			this.logger.debug(`Attempting to get data from storage: ${storageKey}`);
			const storageData = await this.storageProvider.getObject<T>(storageKey);

			if (!storageData) {
				this.logger.debug(`Data not found in storage for key: ${storageKey}`);
			}

			return storageData;
		} catch (error) {
			this.handleError(error, `Error in hybrid cache get for keys: ${redisKey}, ${storageKey}`);
			throw error;
		}
	}

	/**
	 * Deletes data from both Redis cache and persistent storage.
	 *
	 * @param redisKey - The Redis key to delete
	 * @param storageKey - The storage key to delete
	 */
	protected async deleteFromCacheAndStorage(redisKey: string, storageKey: string): Promise<void> {
		return await this.deleteFromCacheAndStorageBatch([redisKey], [storageKey]);
	}

	/**
	 * Deletes data from both Redis cache and persistent storage in batch.
	 *
	 * @param redisKeys - Array of Redis keys to delete
	 * @param storageKeys - Array of storage keys to delete
	 */
	protected async deleteFromCacheAndStorageBatch(redisKeys: string[], storageKeys: string[]): Promise<void> {
		if (redisKeys.length === 0 && storageKeys.length === 0) {
			this.logger.debug('No keys to delete in batch');
			return;
		}

		this.logger.debug(`Batch deleting ${redisKeys.length} Redis keys and ${storageKeys.length} storage keys`);
		const operations = [
			// Batch delete from Redis (only if there are keys to delete)
			redisKeys.length > 0
				? this.redisService.delete(redisKeys).catch((error) => {
						this.logger.warn(`Redis batch delete failed: ${error}`);
						return Promise.reject({ type: 'redis', error, affectedKeys: redisKeys });
					})
				: Promise.resolve(0),

			// Batch delete from storage (only if there are keys to delete)
			storageKeys.length > 0
				? this.storageProvider.deleteObjects(storageKeys).catch((error) => {
						this.logger.warn(`Storage batch delete failed: ${error}`);
						return Promise.reject({ type: 'storage', error, affectedKeys: storageKeys });
					})
				: Promise.resolve()
		];

		try {
			const results = await Promise.allSettled(operations);

			const redisResult = results[0];
			const storageResult = results[1];

			const redisSuccess = redisResult.status === 'fulfilled';
			const storageSuccess = storageResult.status === 'fulfilled';

			if (redisKeys.length > 0) {
				if (redisSuccess) {
					const deletedCount = (redisResult as PromiseFulfilledResult<number>).value;
					this.logger.debug(`Redis batch delete succeeded: ${deletedCount} keys deleted`);
				} else {
					const redisError = (redisResult as PromiseRejectedResult).reason;
					this.logger.warn(`Redis batch delete failed:`, redisError.error);
				}
			}

			if (storageKeys.length > 0) {
				if (storageSuccess) {
					this.logger.debug(`Storage batch delete succeeded: ${storageKeys.length} keys deleted`);
				} else {
					const storageError = (storageResult as PromiseRejectedResult).reason;
					this.logger.warn(`Storage batch delete failed:`, storageError.error);
				}
			}

			this.logger.debug(`Batch delete completed: Redis=${redisSuccess}, Storage=${storageSuccess}`);
		} catch (error) {
			this.handleError(error, `Error in batch delete operation`);
			throw error;
		}
	}

	protected handleError(error: unknown, context: string): void {
		if (error instanceof OpenViduMeetError) {
			this.logger.error(`${context}: ${error.message}`);
		} else {
			this.logger.error(`${context}: ${error}`);
		}
	}
}
