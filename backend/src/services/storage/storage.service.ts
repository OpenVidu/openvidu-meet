import { AuthMode, AuthType, GlobalConfig, MeetApiKey, MeetRecordingInfo, MeetRoom, User, UserRole } from '@typings-ce';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { Readable } from 'stream';
import {
	MEET_INITIAL_ADMIN_PASSWORD,
	MEET_INITIAL_ADMIN_USER,
	MEET_INITIAL_API_KEY,
	MEET_INITIAL_WEBHOOK_ENABLED,
	MEET_INITIAL_WEBHOOK_URL,
	MEET_NAME_ID
} from '../../environment.js';
import { MeetLock, PasswordHelper, RecordingHelper } from '../../helpers/index.js';
import {
	errorRecordingNotFound,
	errorRecordingRangeNotSatisfiable,
	errorRoomNotFound,
	internalError,
	OpenViduMeetError,
	RedisKeyName
} from '../../models/index.js';
import { LoggerService, MutexService, RedisService } from '../index.js';
import { StorageFactory } from './storage.factory.js';
import { StorageKeyBuilder, StorageProvider } from './storage.interface.js';

/**
 * Domain-specific storage service for OpenVidu Meet.
 *
 * This service handles all domain-specific logic for rooms, recordings, and global config,
 * while delegating basic storage operations to the StorageProvider.
 *
 * This architecture follows the Single Responsibility Principle:
 * - StorageProvider: Handles only basic CRUD operations
 * - MeetStorageService: Handles domain-specific business logic
 *
 * @template GConfig - Type for global config, extends GlobalConfig
 * @template MRoom - Type for room data, extends MeetRoom
 * @template MRec - Type for recording data, extends MeetRecordingInfo
 * @template MUser - Type for user data, extends User
 */
@injectable()
export class MeetStorageService<
	GConfig extends GlobalConfig = GlobalConfig,
	MRoom extends MeetRoom = MeetRoom,
	MRec extends MeetRecordingInfo = MeetRecordingInfo,
	MUser extends User = User
> {
	protected storageProvider: StorageProvider;
	protected keyBuilder: StorageKeyBuilder;

	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(StorageFactory) protected storageFactory: StorageFactory,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(RedisService) protected redisService: RedisService
	) {
		const { provider, keyBuilder } = this.storageFactory.create();
		this.storageProvider = provider;
		this.keyBuilder = keyBuilder;
	}

	// ==========================================
	// INITIALIZATION LOGIC
	// ==========================================

	/**
	 * Performs a health check on the storage system.
	 * Verifies both service connectivity and container/bucket existence.
	 * Terminates the process if storage is not accessible.
	 */
	async checkStartupHealth(): Promise<void> {
		try {
			this.logger.verbose('Performing storage health check...');

			// Get the underlying storage service to perform health check
			const isHealthy = await this.storageProvider.checkHealth();

			if (!isHealthy.accessible) {
				this.logger.error('Storage service is not accessible. Terminating process...');
				process.exit(1);
			}

			if (!isHealthy.bucketExists && !isHealthy.containerExists) {
				this.logger.error('Storage bucket/container does not exist. Terminating process...');
				process.exit(1);
			}

			this.logger.verbose('Storage health check passed successfully');
		} catch (error) {
			this.logger.error('Storage health check failed:', error);
			this.logger.error('Terminating process due to storage health check failure...');
			process.exit(1);
		}
	}

	/**
	 * Initializes the storage with default data and initial environment variables if not already initialized.
	 * This includes global config, admin user and API key.
	 */
	async initializeStorage(): Promise<void> {
		try {
			// Acquire a global lock to prevent multiple initializations at the same time when running in HA mode
			const lock = await this.mutexService.acquire(MeetLock.getStorageInitializationLock(), ms('30s'));

			if (!lock) {
				this.logger.warn(
					'Unable to acquire lock for storage initialization. May be already initialized by another instance.'
				);
				return;
			}

			const isInitialized = await this.checkStorageInitialization();

			if (isInitialized) {
				this.logger.verbose('Storage already initialized for this project, skipping initialization');
				return;
			}

			this.logger.info('Storage not initialized or different project detected, proceeding with initialization');

			await this.initializeGlobalConfig();
			await this.initializeAdminUser();
			await this.initializeApiKey();

			this.logger.info('Storage initialization completed successfully');
		} catch (error) {
			this.handleError(error, 'Error initializing storage with default data');
			throw internalError('Failed to initialize storage');
		}
	}

	// ==========================================
	// GLOBAL CONFIG DOMAIN LOGIC
	// ==========================================

	async getGlobalConfig(): Promise<GConfig> {
		const redisKey = RedisKeyName.GLOBAL_CONFIG;
		const storageKey = this.keyBuilder.buildGlobalConfigKey();

		const config = await this.getFromCacheAndStorage<GConfig>(redisKey, storageKey);

		if (config) return config;

		// Build and save default config if not found in cache or storage
		await this.initializeGlobalConfig();
		return this.getDefaultConfig();
	}

	/**
	 * Saves global config to the storage provider.
	 * @param {GConfig} config - The global config to save.
	 * @returns {Promise<GConfig>} The saved global config.
	 */
	async saveGlobalConfig(config: GConfig): Promise<GConfig> {
		this.logger.info('Saving global config');
		const redisKey = RedisKeyName.GLOBAL_CONFIG;
		const storageKey = this.keyBuilder.buildGlobalConfigKey();
		return await this.saveCacheAndStorage<GConfig>(redisKey, storageKey, config);
	}

	// ==========================================
	// ROOM DOMAIN LOGIC
	// ==========================================

	async saveMeetRoom(meetRoom: MRoom): Promise<MRoom> {
		const { roomId } = meetRoom;
		this.logger.info(`Saving OpenVidu room ${roomId}`);
		const redisKey = RedisKeyName.ROOM + roomId;
		const storageKey = this.keyBuilder.buildMeetRoomKey(roomId);

		return await this.saveCacheAndStorage<MRoom>(redisKey, storageKey, meetRoom);
	}

	/**
	 * Retrieves a paginated list of meeting rooms from storage.
	 *
	 * @param maxItems - Optional maximum number of rooms to retrieve per page
	 * @param nextPageToken - Optional token for pagination to get the next set of results
	 * @returns Promise that resolves to an object containing:
	 *   - rooms: Array of MRoom objects retrieved from storage
	 *   - isTruncated: Boolean indicating if there are more results available
	 *   - nextPageToken: Optional token for retrieving the next page of results
	 * @throws Error if the storage operation fails or encounters an unexpected error
	 */
	async getMeetRooms(
		roomName?: string,
		maxItems?: number,
		nextPageToken?: string
	): Promise<{
		rooms: MRoom[];
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

			const rooms: MRoom[] = [];

			if (Contents && Contents.length > 0) {
				const roomPromises = Contents.map(async (item) => {
					if (item.Key && item.Key.endsWith('.json')) {
						try {
							const room = await this.storageProvider.getObject<MRoom>(item.Key);
							return room;
						} catch (error) {
							this.logger.warn(`Failed to load room from ${item.Key}: ${error}`);
							return null;
						}
					}

					return null;
				});

				const roomResults = await Promise.all(roomPromises);
				rooms.push(...roomResults.filter((room): room is Awaited<MRoom> => room !== null));
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

	async getMeetRoom(roomId: string): Promise<MRoom | null> {
		const redisKey = RedisKeyName.ROOM + roomId;
		const storageKey = this.keyBuilder.buildMeetRoomKey(roomId);

		return await this.getFromCacheAndStorage<MRoom>(redisKey, storageKey);
	}

	async deleteMeetRooms(roomIds: string[]): Promise<void> {
		const roomKeys = roomIds.map((roomId) => this.keyBuilder.buildMeetRoomKey(roomId));
		const redisKeys = roomIds.map((roomId) => RedisKeyName.ROOM + roomId);

		await this.deleteFromCacheAndStorageBatch(redisKeys, roomKeys);
	}

	// ==========================================
	// ARCHIVED ROOM METADATA DOMAIN LOGIC
	// ==========================================

	async getArchivedRoomMetadata(roomId: string): Promise<Partial<MRoom> | null> {
		const redisKey = RedisKeyName.ARCHIVED_ROOM + roomId;
		const storageKey = this.keyBuilder.buildArchivedMeetRoomKey(roomId);

		return await this.getFromCacheAndStorage<Partial<MRoom>>(redisKey, storageKey);
	}

	/**
	 * Archives room metadata by storing essential room information in both cache and persistent storage.
	 *
	 * This method retrieves the room data, extracts key metadata (moderator/speaker URLs and
	 * recording config), and saves it to an archived location for future reference.
	 *
	 * If `updateOnlyIfExists` is true, it will only save the archived metadata if it already exists,
	 * updating the existing entry.
	 *
	 * @param roomId - The unique identifier of the room to archive
	 * @param updateOnlyIfExists - If true, only update if archived metadata already exists
	 * @throws {Error} When the room with the specified ID is not found
	 * @returns A promise that resolves when the archiving operation completes successfully
	 */
	async archiveRoomMetadata(roomId: string, updateOnlyIfExists = false): Promise<void> {
		const redisKey = RedisKeyName.ARCHIVED_ROOM + roomId;
		const storageKey = this.keyBuilder.buildArchivedMeetRoomKey(roomId);

		const room = await this.getMeetRoom(roomId);

		if (!room) {
			this.logger.warn(`Room ${roomId} not found, cannot archive metadata`);
			throw errorRoomNotFound(roomId);
		}

		if (updateOnlyIfExists) {
			const existing = await this.getFromCacheAndStorage<Partial<MRoom>>(redisKey, storageKey);

			if (!existing) {
				this.logger.verbose(`Archived metadata for room ${roomId} does not exist, skipping update`);
				return;
			}
		}

		const archivedRoom: Partial<MRoom> = {
			moderatorUrl: room.moderatorUrl,
			speakerUrl: room.speakerUrl,
			config: {
				recording: room.config.recording
			}
		} as Partial<MRoom>;

		await this.saveCacheAndStorage<Partial<MRoom>>(redisKey, storageKey, archivedRoom);
	}

	async deleteArchivedRoomMetadata(roomId: string): Promise<void> {
		const redisKey = RedisKeyName.ARCHIVED_ROOM + roomId;
		const storageKey = this.keyBuilder.buildArchivedMeetRoomKey(roomId);

		await this.deleteFromCacheAndStorage(redisKey, storageKey);
		this.logger.verbose(`Archived room metadata deleted for room ${roomId} in recordings bucket`);
	}

	// ==========================================
	// RECORDING DOMAIN LOGIC
	// ==========================================

	async saveRecordingMetadata(recordingInfo: MRec): Promise<MRec> {
		const redisKey = RedisKeyName.RECORDING + recordingInfo.recordingId;
		const storageKey = this.keyBuilder.buildMeetRecordingKey(recordingInfo.recordingId);
		return await this.saveCacheAndStorage<MRec>(redisKey, storageKey, recordingInfo);
	}

	/**
	 * Retrieves all recordings from storage, optionally filtered by room ID.
	 *
	 * @param roomId - Optional room identifier to filter recordings. If not provided, retrieves all recordings.
	 * @param maxItems - Optional maximum number of items to return per page for pagination.
	 * @param nextPageToken - Optional token for pagination to retrieve the next page of results.
	 *
	 * @returns A promise that resolves to an object containing:
	 *   - `recordings`: Array of recording metadata objects (MRec)
	 *   - `isTruncated`: Optional boolean indicating if there are more results available
	 *   - `nextContinuationToken`: Optional token to retrieve the next page of results
	 *
	 * @throws Will throw an error if storage retrieval fails or if there's an issue processing the recordings
	 *
	 * @remarks
	 * This method handles pagination and filters out any recordings that fail to load.
	 * Failed recordings are logged as warnings but don't cause the entire operation to fail.
	 * The method logs debug information about the retrieval process and summary statistics.
	 */
	async getAllRecordings(
		roomId?: string,
		maxItems?: number,
		nextPageToken?: string
	): Promise<{ recordings: MRec[]; isTruncated?: boolean; nextContinuationToken?: string }> {
		try {
			const searchKey = this.keyBuilder.buildAllMeetRecordingsKey(roomId);
			const scope = roomId ? ` for room ${roomId}` : '';

			this.logger.debug(`Retrieving recordings${scope} with key: ${searchKey}`);
			const { Contents, IsTruncated, NextContinuationToken } = await this.storageProvider.listObjects(
				searchKey,
				maxItems,
				nextPageToken
			);

			if (!Contents || Contents.length === 0) {
				this.logger.verbose(`No recordings found${scope}`);
				return { recordings: [], isTruncated: false };
			}

			const metadataFiles = Contents; //Contents.filter((item) => item.Key && item.Key.endsWith('.json'));

			const recordingPromises = metadataFiles.map(async (item) => {
				try {
					const recording = await this.storageProvider.getObject<MRec>(item.Key!);
					return recording;
				} catch (error) {
					this.logger.warn(`Failed to load recording metadata from ${item.Key}: ${error}`);
					return null; // Return null for failed loads, filter out later
				}
			});

			// Wait for all recordings to load and filter out failures
			const recordingResults = await Promise.all(recordingPromises);
			const validRecordings = recordingResults.filter(
				(recording): recording is Awaited<MRec> => recording !== null && recording !== undefined
			);

			// Log results summary
			const failedCount = recordingResults.length - validRecordings.length;

			if (failedCount > 0) {
				this.logger.warn(`Failed to load ${failedCount} out of ${recordingResults.length} recordings${scope}`);
			}

			this.logger.verbose(`Successfully retrieved ${validRecordings.length} recordings${scope}`);

			return {
				recordings: validRecordings,
				isTruncated: Boolean(IsTruncated),
				nextContinuationToken: NextContinuationToken
			};
		} catch (error) {
			this.handleError(error, 'Error retrieving all recordings');
			throw error;
		}
	}

	async getRecordingMetadata(recordingId: string): Promise<{ recordingInfo: MRec; metadataFilePath: string }> {
		try {
			const redisKey = RedisKeyName.RECORDING + recordingId;
			const storageKey = this.keyBuilder.buildMeetRecordingKey(recordingId);

			const recordingInfo = await this.getFromCacheAndStorage<MRec>(redisKey, storageKey);

			if (!recordingInfo) {
				throw errorRecordingNotFound(recordingId);
			}

			this.logger.debug(`Retrieved recording for ${recordingId}`);
			return { recordingInfo, metadataFilePath: storageKey };
		} catch (error) {
			this.logger.error(`Error fetching recording metadata for recording ${recordingId}: ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes a recording and its metadata by recordingId.
	 * This method handles the path building internally, making it agnostic to storage backend.
	 *
	 * @param recordingId - The unique identifier of the recording to delete
	 * @returns Promise that resolves when both binary files and metadata are deleted
	 */
	async deleteRecording(recordingId: string): Promise<void> {
		try {
			// Keys for recording metadata
			const redisMetadataKey = RedisKeyName.RECORDING + recordingId;
			const storageMetadataKey = this.keyBuilder.buildMeetRecordingKey(recordingId);

			// Key for access recording secrets
			const storageSecretsKey = this.keyBuilder.buildAccessRecordingSecretsKey(recordingId);
			const redisSecretsKey = RedisKeyName.RECORDING_SECRETS + recordingId;

			// Binary recording key
			const binaryRecordingKey = this.keyBuilder.buildBinaryRecordingKey(recordingId);

			this.logger.info(`Deleting recording ${recordingId} with metadata key ${storageMetadataKey}`);

			// Delete secrets, metadata and binary recording files
			await Promise.all([
				this.deleteFromCacheAndStorageBatch(
					[redisMetadataKey, redisSecretsKey],
					[storageMetadataKey, storageSecretsKey]
				),
				this.storageProvider.deleteObject(binaryRecordingKey)
			]);

			this.logger.verbose(`Successfully deleted recording ${recordingId}`);
		} catch (error) {
			this.handleError(error, `Error deleting recording ${recordingId}`);
			throw error;
		}
	}

	/**
	 * Deletes multiple recordings by recordingIds.
	 *
	 * @param recordingIds - Array of recording identifiers to delete
	 * @returns Promise that resolves when all recordings are deleted
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
			const binaryKeys: string[] = [];

			for (const recordingId of recordingIds) {
				redisKeys.push(RedisKeyName.RECORDING + recordingId);
				redisKeys.push(RedisKeyName.RECORDING_SECRETS + recordingId);

				storageKeys.push(this.keyBuilder.buildMeetRecordingKey(recordingId));
				storageKeys.push(this.keyBuilder.buildAccessRecordingSecretsKey(recordingId));

				binaryKeys.push(this.keyBuilder.buildBinaryRecordingKey(recordingId));
			}

			this.logger.debug(`Bulk deleting ${recordingIds.length} recordings`);

			// Delete all files in parallel using batch operations
			await Promise.all([
				this.deleteFromCacheAndStorageBatch(redisKeys, storageKeys),
				this.storageProvider.deleteObjects(binaryKeys)
			]);
			this.logger.verbose(`Successfully bulk deleted ${recordingIds.length} recordings`);
		} catch (error) {
			this.handleError(error, `Error deleting recordings: ${recordingIds.join(', ')}`);
			throw error;
		}
	}

	async getRecordingMedia(
		recordingId: string,
		range?: { end: number; start: number }
	): Promise<{ fileSize: number | undefined; fileStream: Readable; start?: number; end?: number }> {
		try {
			const binaryRecordingKey = this.keyBuilder.buildBinaryRecordingKey(recordingId);
			this.logger.debug(`Retrieving recording media for recording ${recordingId} from ${binaryRecordingKey}`);

			const fileSize = await this.getRecordingFileSize(binaryRecordingKey, recordingId);
			const validatedRange = this.validateAndAdjustRange(range, fileSize, recordingId);
			const fileStream = await this.storageProvider.getObjectAsStream(binaryRecordingKey, validatedRange);

			return {
				fileSize,
				fileStream,
				start: validatedRange?.start,
				end: validatedRange?.end
			};
		} catch (error) {
			this.logger.error(`Error fetching recording media for recording ${recordingId}: ${error}`);
			throw error;
		}
	}

	/**
	 * Saves access recording secrets (public and private) for a specific recording.
	 *
	 * @param recordingId - The unique identifier of the recording
	 * @param secrets - Object containing the public and private access secrets
	 * @param secrets.publicAccessSecret - The public access secret for the recording
	 * @param secrets.privateAccessSecret - The private access secret for the recording
	 * @returns A promise that resolves when the secrets are successfully saved
	 * @throws Will throw an error if the storage operation fails
	 */
	async saveAccessRecordingSecrets(recordingId: string): Promise<void> {
		try {
			const redisKey = RedisKeyName.RECORDING_SECRETS + recordingId;
			const storageKey = this.keyBuilder.buildAccessRecordingSecretsKey(recordingId);
			const secrets = RecordingHelper.buildAccessSecrets();
			this.logger.debug(`Saving access secrets for recording ${recordingId} at ${storageKey}`);
			await this.saveCacheAndStorage(redisKey, storageKey, secrets);
		} catch (error) {
			this.handleError(error, `Error saving access secrets for recording ${recordingId}`);
			throw error;
		}
	}

	async getAccessRecordingSecrets(
		recordingId: string
	): Promise<{ publicAccessSecret: string; privateAccessSecret: string } | null> {
		try {
			const redisKey = RedisKeyName.RECORDING_SECRETS + recordingId;
			const secretsKey = this.keyBuilder.buildAccessRecordingSecretsKey(recordingId);
			this.logger.debug(`Retrieving access secrets for recording ${recordingId} from ${secretsKey}`);

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

	// ==========================================
	// USER DOMAIN LOGIC
	// ==========================================

	/**
	 * Retrieves user data for a specific username.
	 *
	 * @param username - The username of the user to retrieve
	 * @returns A promise that resolves to the user data, or null if not found
	 */
	async getUser(username: string): Promise<MUser | null> {
		const redisKey = RedisKeyName.USER + username;
		const storageKey = this.keyBuilder.buildUserKey(username);

		return await this.getFromCacheAndStorage<MUser>(redisKey, storageKey);
	}

	/**
	 * Saves user data to the storage provider.
	 *
	 * @param user - The user data to be saved
	 * @returns A promise that resolves to the saved user data
	 */
	async saveUser(user: MUser): Promise<MUser> {
		const { username } = user;
		const userRedisKey = RedisKeyName.USER + username;
		const storageUserKey = this.keyBuilder.buildUserKey(username);

		return await this.saveCacheAndStorage(userRedisKey, storageUserKey, user);
	}

	async saveApiKey(apiKeyData: MeetApiKey): Promise<void> {
		const redisKey = RedisKeyName.API_KEYS;
		const storageKey = this.keyBuilder.buildApiKeysKey();
		this.logger.debug(`Saving API key to Redis and storage: ${redisKey}`);
		await this.saveCacheAndStorage(redisKey, storageKey, [apiKeyData]);
	}

	async getApiKeys(): Promise<MeetApiKey[]> {
		const redisKey = RedisKeyName.API_KEYS;
		const storageKey = this.keyBuilder.buildApiKeysKey();
		this.logger.debug(`Retrieving API key from Redis and storage: ${redisKey}`);
		const apiKeys = await this.getFromCacheAndStorage<MeetApiKey[]>(redisKey, storageKey);

		if (!apiKeys || apiKeys.length === 0) {
			this.logger.warn('API key not found in cache or storage');
			return [];
		}

		this.logger.debug(`Retrieved API key from storage: ${storageKey}`);
		return apiKeys;
	}

	async deleteApiKeys(): Promise<void> {
		const redisKey = RedisKeyName.API_KEYS;
		const storageKey = this.keyBuilder.buildApiKeysKey();
		this.logger.debug(`Deleting API key from Redis and storage: ${redisKey}`);
		await this.deleteFromCacheAndStorage(redisKey, storageKey);
		this.logger.verbose(`API key deleted successfully from storage: ${storageKey}`);
	}

	// ==========================================
	// PRIVATE HELPER METHODS
	// ==========================================

	/**
	 * Checks if storage is already initialized by verifying that global config exist
	 * and belong to the current project.
	 * @returns {Promise<boolean>} True if storage is already initialized for this project
	 */
	protected async checkStorageInitialization(): Promise<boolean> {
		try {
			const redisKey = RedisKeyName.GLOBAL_CONFIG;
			const storageKey = this.keyBuilder.buildGlobalConfigKey();

			const existing = await this.getFromCacheAndStorage<GConfig>(redisKey, storageKey);

			if (!existing) {
				this.logger.verbose('No global config found, storage needs initialization');
				return false;
			}

			// Check if it's from the same project
			const existingProjectId = (existing as GlobalConfig)?.projectId;
			const currentProjectId = MEET_NAME_ID;

			if (existingProjectId !== currentProjectId) {
				this.logger.info(
					`Different project detected: existing='${existingProjectId}', current='${currentProjectId}'. Re-initialization required.`
				);
				return false;
			}

			this.logger.verbose(`Storage already initialized for project '${currentProjectId}'`);
			return true;
		} catch (error) {
			this.logger.warn('Error checking storage initialization status:', error);
			throw error;
		}
	}

	/**
	 * Initializes default global config if not already present.
	 */
	protected async initializeGlobalConfig(): Promise<void> {
		const config = this.getDefaultConfig();
		await this.saveGlobalConfig(config);
		this.logger.info('Global config initialized with default values');
	}

	/**
	 * Returns the default global config.
	 * @returns {GConfig}
	 */
	protected getDefaultConfig(): GConfig {
		return {
			projectId: MEET_NAME_ID,
			webhooksConfig: {
				enabled: MEET_INITIAL_WEBHOOK_ENABLED === 'true' && MEET_INITIAL_API_KEY,
				url: MEET_INITIAL_WEBHOOK_URL
			},
			securityConfig: {
				authentication: {
					authMethod: {
						type: AuthType.SINGLE_USER
					},
					authModeToAccessRoom: AuthMode.NONE
				}
			}
		} as GConfig;
	}

	/**
	 * Initializes the default admin user
	 */
	protected async initializeAdminUser(): Promise<void> {
		const admin = {
			username: MEET_INITIAL_ADMIN_USER,
			passwordHash: await PasswordHelper.hashPassword(MEET_INITIAL_ADMIN_PASSWORD),
			roles: [UserRole.ADMIN, UserRole.USER]
		} as MUser;

		await this.saveUser(admin);
		this.logger.info(`Admin user initialized with default credentials`);
	}

	/**
	 * Initializes the API key if configured
	 */
	protected async initializeApiKey(): Promise<void> {
		// Check if initial API key is configured
		const initialApiKey = MEET_INITIAL_API_KEY;

		if (!initialApiKey) {
			this.logger.info('No initial API key configured, skipping API key initialization');
			return;
		}

		const apiKeyData: MeetApiKey = PasswordHelper.generateApiKey(initialApiKey);
		await this.saveApiKey(apiKeyData);
		this.logger.info('API key initialized');
	}

	protected async getRecordingFileSize(key: string, recordingId: string): Promise<number> {
		const { contentLength: fileSize } = await this.storageProvider.getObjectHeaders(key);

		if (!fileSize) {
			this.logger.warn(`Recording media not found for recording ${recordingId}`);
			throw errorRecordingNotFound(recordingId);
		}

		return fileSize;
	}

	protected validateAndAdjustRange(
		range: { end: number; start: number } | undefined,
		fileSize: number,
		recordingId: string
	): { start: number; end: number } | undefined {
		if (!range) return undefined;

		const { start, end: originalEnd } = range;

		// Validate input values
		if (isNaN(start) || isNaN(originalEnd) || start < 0) {
			this.logger.warn(`Invalid range values for recording ${recordingId}: start=${start}, end=${originalEnd}`);
			this.logger.warn(`Returning full stream for recording ${recordingId}`);
			return undefined;
		}

		// Check if start is beyond file size
		if (start >= fileSize) {
			this.logger.error(
				`Invalid range: start=${start} exceeds fileSize=${fileSize} for recording ${recordingId}`
			);
			throw errorRecordingRangeNotSatisfiable(recordingId, fileSize);
		}

		// Adjust end to not exceed file bounds
		const adjustedEnd = Math.min(originalEnd, fileSize - 1);

		// Validate final range
		if (start > adjustedEnd) {
			this.logger.warn(
				`Invalid range after adjustment: start=${start}, end=${adjustedEnd} for recording ${recordingId}`
			);
			return undefined;
		}

		this.logger.debug(
			`Valid range for recording ${recordingId}: start=${start}, end=${adjustedEnd}, fileSize=${fileSize}`
		);
		return { start, end: adjustedEnd };
	}

	// ==========================================
	// PRIVATE HYBRID CACHE METHODS (Redis + Storage)
	// ==========================================

	/**
	 * Saves data to both Redis cache and persistent storage with fallback handling.
	 *
	 * @param redisKey - The Redis key to store the data
	 * @param storageKey - The storage key/path for persistent storage
	 * @param data - The data to store
	 * @param redisTtl - Optional TTL for Redis cache (default: 1 hour)
	 * @returns Promise that resolves when data is saved to at least one location
	 */
	protected async saveCacheAndStorage<T>(redisKey: string, storageKey: string, data: T): Promise<T> {
		const operations = [
			// Save to Redis (fast cache)
			this.redisService.set(redisKey, JSON.stringify(data)).catch((error) => {
				this.logger.warn(`Redis save failed for key ${redisKey}: ${error}`);
				return Promise.reject({ type: 'redis', error });
			}),

			// Save to persistent storage
			this.storageProvider.putObject(storageKey, data).catch((error) => {
				this.logger.warn(`Storage save failed for key ${storageKey}: ${error}`);
				return Promise.reject({ type: 'storage', error });
			})
		];

		try {
			// Try to save to both locations
			const results = await Promise.allSettled(operations);

			const redisResult = results[0];
			const storageResult = results[1];

			// Check if at least one succeeded
			const redisSuccess = redisResult.status === 'fulfilled';
			const storageSuccess = storageResult.status === 'fulfilled';

			if (!redisSuccess && !storageSuccess) {
				// Both failed - this is critical
				const redisError = (redisResult as PromiseRejectedResult).reason;
				const storageError = (storageResult as PromiseRejectedResult).reason;

				this.logger.error(`Save failed for both Redis and Storage:`, {
					redisKey,
					storageKey,
					redisError: redisError.error,
					storageError: storageError.error
				});

				throw new Error(`Failed to save data: Redis (${redisError.error}) and Storage (${storageError.error})`);
			}

			// Log partial failures
			if (!redisSuccess) {
				const redisError = (redisResult as PromiseRejectedResult).reason;
				this.logger.warn(`Redis save failed but storage succeeded for key ${redisKey}:`, redisError.error);
			}

			if (!storageSuccess) {
				const storageError = (storageResult as PromiseRejectedResult).reason;
				this.logger.warn(`Storage save failed but Redis succeeded for key ${storageKey}:`, storageError.error);
			}

			// Success if at least one location worked
			this.logger.debug(`Save completed: Redis=${redisSuccess}, Storage=${storageSuccess}`);
			return data;
		} catch (error) {
			this.handleError(error, `Error saving keys: ${redisKey}, ${storageKey}`);
			throw error;
		}
	}

	/**
	 * Retrieves data from Redis cache first, falls back to storage if not found.
	 * Updates Redis cache if data is retrieved from storage.
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
				return null;
			}

			// 3. Found in storage - update Redis cache for next time
			this.logger.debug(`Storage HIT for key: ${storageKey}, updating cache`);

			try {
				await this.redisService.set(redisKey, JSON.stringify(storageData));
				this.logger.debug(`Successfully updated cache for key: ${redisKey}`);
			} catch (cacheUpdateError) {
				// Cache update failure shouldn't affect the main operation
				this.logger.warn(`Failed to update cache for key ${redisKey}: ${cacheUpdateError}`);
			}

			return storageData;
		} catch (error) {
			this.handleError(error, `Error in hybrid cache get for keys: ${redisKey}, ${storageKey}`);

			throw error; // Re-throw unexpected errors
		}
	}

	/**
	 * Deletes data from both Redis cache and persistent storage.
	 *
	 * @param redisKey - The Redis key to delete
	 * @param storageKey - The storage key to delete
	 * @returns Promise that resolves when deletion is attempted on both locations
	 */
	protected async deleteFromCacheAndStorage(redisKey: string, storageKey: string): Promise<void> {
		return await this.deleteFromCacheAndStorageBatch([redisKey], [storageKey]);
	}

	/**
	 * Deletes data from both Redis cache and persistent storage in batch.
	 * More efficient than multiple individual delete operations.
	 *
	 * @param deletions - Array of objects containing redisKey and storageKey pairs
	 * @returns Promise that resolves when batch deletion is attempted on both locations
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

	/**
	 * Invalidates Redis cache for a specific key.
	 * Useful when you know data has changed and want to force next read from storage.
	 */
	protected async invalidateCache(redisKey: string): Promise<void> {
		try {
			await this.redisService.delete(redisKey);
			this.logger.debug(`Cache invalidated for key: ${redisKey}`);
		} catch (error) {
			this.logger.warn(`Failed to invalidate cache for key ${redisKey}: ${error}`);
			// Don't throw - cache invalidation failure shouldn't break main flow
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
