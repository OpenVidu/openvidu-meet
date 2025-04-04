import { GlobalPreferences, MeetRoom } from '@typings-ce';
import { StorageProvider } from '../storage.interface.js';
import { S3Service } from '../../s3.service.js';
import { LoggerService } from '../../logger.service.js';
import { RedisService } from '../../redis.service.js';
import { OpenViduMeetError } from '../../../models/error.model.js';
import { inject, injectable } from '../../../config/dependency-injector.config.js';
import { MEET_S3_ROOMS_PREFIX, MEET_S3_SUBBUCKET } from '../../../environment.js';
import { RedisKeyName } from '../../../models/redis.model.js';

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
 * @template G - Type for global preferences data, defaults to GlobalPreferences
 * @template R - Type for room data, defaults to MeetRoom
 *
 * @implements {StorageProvider}
 */
@injectable()
export class S3Storage<G extends GlobalPreferences = GlobalPreferences, R extends MeetRoom = MeetRoom>
	implements StorageProvider
{
	protected readonly S3_GLOBAL_PREFERENCES_KEY = `${MEET_S3_SUBBUCKET}/global-preferences.json`;
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(S3Service) protected s3Service: S3Service,
		@inject(RedisService) protected redisService: RedisService
	) {}

	/**
	 * Initializes global preferences. If no preferences exist, persists the provided defaults.
	 * If preferences exist but belong to a different project, they are replaced.
	 *
	 * @param defaultPreferences - The default preferences to initialize with.
	 */
	async initialize(defaultPreferences: G): Promise<void> {
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
	async getGlobalPreferences(): Promise<G | null> {
		try {
			// Try to get preferences from Redis cache
			let preferences: G | null = await this.getFromRedis<G>(RedisKeyName.GLOBAL_PREFERENCES);

			if (!preferences) {
				this.logger.debug('Global preferences not found in Redis. Fetching from S3...');
				preferences = await this.getFromS3<G>(this.S3_GLOBAL_PREFERENCES_KEY);

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
	async saveGlobalPreferences(preferences: G): Promise<G> {
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

	async saveMeetRoom(ovRoom: R): Promise<R> {
		const { roomId } = ovRoom;
		const s3Path = `${MEET_S3_ROOMS_PREFIX}/${roomId}/${roomId}.json`;
		const roomStr = JSON.stringify(ovRoom);

		const results = await Promise.allSettled([
			this.s3Service.saveObject(s3Path, ovRoom),
			// TODO: Use a key prefix for Redis
			this.redisService.set(roomId, roomStr, false)
		]);

		const s3Result = results[0];
		const redisResult = results[1];

		if (s3Result.status === 'fulfilled' && redisResult.status === 'fulfilled') {
			return ovRoom;
		}

		// Rollback changes if one of the operations failed
		if (s3Result.status === 'fulfilled') {
			try {
				await this.s3Service.deleteObject(s3Path);
			} catch (rollbackError) {
				this.logger.error(`Error rolling back S3 save for room ${roomId}: ${rollbackError}`);
			}
		}

		if (redisResult.status === 'fulfilled') {
			try {
				await this.redisService.delete(roomId);
			} catch (rollbackError) {
				this.logger.error(`Error rolling back Redis set for room ${roomId}: ${rollbackError}`);
			}
		}

		// Return the error that occurred first
		const rejectedResult: PromiseRejectedResult =
			s3Result.status === 'rejected' ? s3Result : (redisResult as PromiseRejectedResult);
		const error = rejectedResult.reason;
		this.handleError(error, `Error saving Room preferences for room ${roomId}`);
		throw error;
	}

	async getMeetRooms(
		maxItems: number,
		nextPageToken?: string
	): Promise<{
		rooms: R[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		try {
			const {
				Contents: roomFiles,
				IsTruncated,
				NextContinuationToken
			} = await this.s3Service.listObjectsPaginated(MEET_S3_ROOMS_PREFIX, maxItems, nextPageToken);

			if (!roomFiles) {
				this.logger.verbose('No rooms found. Returning an empty array.');
				return { rooms: [], isTruncated: false };
			}

			// const promises: Promise<R>[] = [];
			// // Retrieve the data for each room
			// roomFiles.forEach((item) => {
			// 	if (item?.Key && item.Key.endsWith('.json')) {
			// 		promises.push(getOpenViduRoom(item.Key) as Promise<R>);
			// 	}
			// });

			// Extract room names from file paths
			const roomIds = roomFiles.map((file) => this.extractRoomId(file.Key)).filter(Boolean) as string[];
			// Fetch room preferences in parallel
			const rooms = await Promise.all(
				roomIds.map(async (roomId: string) => {
					if (!roomId) return null;

					try {
						return await this.getMeetRoom(roomId);
					} catch (error: any) {
						this.logger.warn(`Failed to fetch room "${roomId}": ${error.message}`);
						return null;
					}
				})
			);

			// Filter out null values
			const roomsResponse = rooms.filter(Boolean) as R[];
			return { rooms: roomsResponse, isTruncated: !!IsTruncated, nextPageToken: NextContinuationToken };
		} catch (error) {
			this.handleError(error, 'Error fetching Room preferences');
			return { rooms: [], isTruncated: false };
		}
	}

	/**
	 * Extracts the room id from the given file path.
	 * Assumes the room name is located one directory before the file name.
	 * Example: 'path/to/roomId/file.json' -> 'roomId'
	 * @param filePath - The S3 object key representing the file path.
	 * @returns The extracted room name or null if extraction fails.
	 */
	private extractRoomId(filePath?: string): string | null {
		if (!filePath) return null;

		const parts = filePath.split('/');

		if (parts.length < 2) {
			this.logger.warn(`Invalid room file path: ${filePath}`);
			return null;
		}

		return parts[parts.length - 2];
	}

	async getMeetRoom(roomId: string): Promise<R | null> {
		try {
			const room: R | null = await this.getFromRedis<R>(roomId);

			if (!room) {
				this.logger.debug(`Room ${roomId} not found in Redis. Fetching from S3...`);
				return await this.getFromS3<R>(`${MEET_S3_ROOMS_PREFIX}/${roomId}/${roomId}.json`);
			}

			this.logger.debug(`Room ${roomId} verified in Redis`);
			return room;
		} catch (error) {
			this.handleError(error, `Error fetching Room preferences for room ${roomId}`);
			return null;
		}
	}

	async deleteMeetRoom(roomId: string): Promise<void> {
		try {
			await Promise.all([
				this.s3Service.deleteObject(`${MEET_S3_ROOMS_PREFIX}/${roomId}/${roomId}.json`),
				this.redisService.delete(roomId)
			]);
		} catch (error) {
			this.handleError(error, `Error deleting Room preferences for room ${roomId}`);
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

	protected handleError(error: any, message: string) {
		if (error instanceof OpenViduMeetError) {
			this.logger.error(`${message}: ${error.message}`);
		} else {
			this.logger.error(`${message}: Unexpected error`);
		}
	}
}
