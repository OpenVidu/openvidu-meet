/**
 * Implements storage for preferences using S3.
 * This is used when the application is configured to operate in "s3" mode.
 */

import { GlobalPreferences, MeetRoom } from '@typings-ce';
import { PreferencesStorage } from './global-preferences-storage.interface.js';
import { S3Service } from '../s3.service.js';
import { LoggerService } from '../logger.service.js';
import { RedisService } from '../redis.service.js';
import { OpenViduMeetError } from '../../models/error.model.js';
import { inject, injectable } from '../../config/dependency-injector.config.js';
import { MEET_S3_ROOMS_PREFIX } from '../../environment.js';

// TODO Rename this service to MeetStorageService?
@injectable()
export class S3PreferenceStorage<
	G extends GlobalPreferences = GlobalPreferences,
	R extends MeetRoom = MeetRoom
> implements PreferencesStorage
{
	protected readonly GLOBAL_PREFERENCES_KEY = 'openvidu-meet-preferences';
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(S3Service) protected s3Service: S3Service,
		@inject(RedisService) protected redisService: RedisService
	) {}

	async initialize(defaultPreferences: G): Promise<void> {
		const existingPreferences = await this.getGlobalPreferences();

		if (existingPreferences) {
			if (existingPreferences.projectId !== defaultPreferences.projectId) {
				this.logger.warn(
					`Existing preferences are associated with a different project (Project ID: ${existingPreferences.projectId}). Replacing them with the default preferences for the current project.`
				);

				await this.saveGlobalPreferences(defaultPreferences);
			}
		} else {
			this.logger.info('Saving default preferences to S3');
			await this.saveGlobalPreferences(defaultPreferences);
		}
	}

	async getGlobalPreferences(): Promise<G | null> {
		try {
			let preferences: G | null = await this.getFromRedis<G>(this.GLOBAL_PREFERENCES_KEY);

			if (!preferences) {
				// Fallback to fetching from S3 if Redis doesn't have it
				this.logger.debug('Preferences not found in Redis. Fetching from S3...');
				preferences = await this.getFromS3<G>(`${this.GLOBAL_PREFERENCES_KEY}.json`);

				if (preferences) {
					// TODO: Use a key prefix for Redis
					await this.redisService.set(this.GLOBAL_PREFERENCES_KEY, JSON.stringify(preferences), false);
				}
			}

			return preferences;
		} catch (error) {
			this.handleError(error, 'Error fetching preferences');
			return null;
		}
	}

	async saveGlobalPreferences(preferences: G): Promise<G> {
		try {
			await Promise.all([
				this.s3Service.saveObject(`${this.GLOBAL_PREFERENCES_KEY}.json`, preferences),
				// TODO: Use a key prefix for Redis
				this.redisService.set(this.GLOBAL_PREFERENCES_KEY, JSON.stringify(preferences), false)
			]);
			return preferences;
		} catch (error) {
			this.handleError(error, 'Error saving preferences');
			throw error;
		}
	}

	async saveOpenViduRoom(ovRoom: R): Promise<R> {
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

	async getOpenViduRooms(): Promise<R[]> {
		try {
			const content = await this.s3Service.listObjects(MEET_S3_ROOMS_PREFIX);
			const roomFiles =
				content.Contents?.filter(
					(file) =>
						file?.Key?.endsWith('.json') &&
						file.Key !== `${this.GLOBAL_PREFERENCES_KEY}.json`
				) ?? [];

			if (roomFiles.length === 0) {
				this.logger.verbose('No OpenVidu rooms found in S3');
				return [];
			}

			// Extract room names from file paths
			const roomIds = roomFiles.map((file) => this.extractRoomId(file.Key)).filter(Boolean) as string[];
			// Fetch room preferences in parallel
			const rooms = await Promise.all(
				roomIds.map(async (roomId: string) => {
					if (!roomId) return null;

					try {
						return await this.getOpenViduRoom(roomId);
					} catch (error: any) {
						this.logger.warn(`Failed to fetch room "${roomId}": ${error.message}`);
						return null;
					}
				})
			);

			// Filter out null values
			return rooms.filter(Boolean) as R[];
		} catch (error) {
			this.handleError(error, 'Error fetching Room preferences');
			return [];
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

	async getOpenViduRoom(roomId: string): Promise<R | null> {
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

	async deleteOpenViduRoom(roomId: string): Promise<void> {
		try {
			await Promise.all([
				this.s3Service.deleteObject(`${MEET_S3_ROOMS_PREFIX}/${roomId}/${roomId}.json`),
				this.redisService.delete(roomId)
			]);
		} catch (error) {
			this.handleError(error, `Error deleting Room preferences for room ${roomId}`);
		}
	}

	protected async getFromRedis<U>(key: string): Promise<U | null> {
		let response: string | null = null;

		response = await this.redisService.get(key);

		if (response) {
			return JSON.parse(response) as U;
		}

		return null;
	}

	protected async getFromS3<U>(path: string): Promise<U | null> {
		const response = await this.s3Service.getObjectAsJson(path);

		if (response) {
			this.logger.verbose(`Object found in S3 at path: ${path}`);
			return response as U;
		}

		return null;
	}

	protected handleError(error: any, message: string) {
		if (error instanceof OpenViduMeetError) {
			this.logger.error(`${message}: ${error.message}`);
		} else {
			this.logger.error(`${message}: Unexpected error`);
		}
	}
}
