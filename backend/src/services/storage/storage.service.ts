import { AuthMode, AuthType, GlobalPreferences, MeetRecordingInfo, MeetRoom } from '@typings-ce';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { MEET_NAME_ID, MEET_SECRET, MEET_USER, MEET_WEBHOOK_ENABLED, MEET_WEBHOOK_URL } from '../../environment.js';
import { MeetLock, PasswordHelper } from '../../helpers/index.js';
import { errorRoomNotFound, internalError, OpenViduMeetError } from '../../models/error.model.js';
import { LoggerService, MutexService, StorageFactory, StorageProvider } from '../index.js';
import { Readable } from 'stream';

/**
 * A service for managing storage operations related to OpenVidu Meet rooms and preferences.
 *
 * This service provides an abstraction layer over the underlying storage implementation,
 * handling initialization, retrieval, and persistence of global preferences and room data.
 *
 * @template GPrefs - Type for global preferences, extends GlobalPreferences
 * @template MRoom - Type for room data, extends MeetRoom
 */
@injectable()
export class MeetStorageService<
	GPrefs extends GlobalPreferences = GlobalPreferences,
	MRoom extends MeetRoom = MeetRoom,
	MRec extends MeetRecordingInfo = MeetRecordingInfo
> {
	protected storageProvider: StorageProvider;
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(StorageFactory) protected storageFactory: StorageFactory,
		@inject(MutexService) protected mutexService: MutexService
	) {
		this.storageProvider = this.storageFactory.create();
	}

	async getObjectHeaders(filePath: string): Promise<{ contentLength?: number; contentType?: string }> {
		try {
			const headers = await this.storageProvider.getObjectHeaders(filePath);
			this.logger.verbose(`Object headers retrieved: ${JSON.stringify(headers)}`);
			return headers;
		} catch (error) {
			this.handleError(error, 'Error retrieving object headers');
			throw internalError('Getting object headers');
		}
	}

	/**
	 * Lists objects in the storage with optional pagination support.
	 *
	 * @param prefix - The prefix to filter objects by (acts as a folder path)
	 * @param maxItems - Maximum number of items to return (optional)
	 * @param nextPageToken - Token for pagination to get the next page (optional)
	 * @returns Promise resolving to paginated list of objects with metadata
	 */
	listObjects(
		prefix: string,
		maxItems?: number,
		nextPageToken?: string
	): Promise<{
		Contents?: Array<{
			Key?: string;
			LastModified?: Date;
			Size?: number;
			ETag?: string;
		}>;
		IsTruncated?: boolean;
		NextContinuationToken?: string;
	}> {
		return this.storageProvider.listObjects(prefix, maxItems, nextPageToken);
	}

	/**
	 * Initializes default preferences if not already initialized.
	 * @returns {Promise<GPrefs>} Default global preferences.
	 */
	async initializeGlobalPreferences(): Promise<void> {
		try {
			// Acquire a global lock to prevent multiple initializations at the same time when running in HA mode
			const lock = await this.mutexService.acquire(MeetLock.getGlobalPreferencesLock(), ms('30s'));

			if (!lock) {
				this.logger.warn(
					'Unable to acquire lock for global preferences initialization. May be already initialized by another instance.'
				);
				return;
			}

			const preferences = await this.getDefaultPreferences();

			this.logger.verbose('Initializing global preferences with default values');
			await this.storageProvider.initialize(preferences);
		} catch (error) {
			this.handleError(error, 'Error initializing default preferences');
		}
	}

	/**
	 * Retrieves the global preferences, initializing them if necessary.
	 * @returns {Promise<GPrefs>}
	 */
	async getGlobalPreferences(): Promise<GPrefs> {
		let preferences = await this.storageProvider.getGlobalPreferences();

		if (preferences) return preferences as GPrefs;

		await this.initializeGlobalPreferences();
		preferences = await this.storageProvider.getGlobalPreferences();

		if (!preferences) {
			this.logger.error('Global preferences not found after initialization');
			throw internalError('getting global preferences');
		}

		return preferences as GPrefs;
	}

	/**
	 * Saves the global preferences to the storage provider.
	 * @param {GPrefs} preferences
	 * @returns {Promise<GPrefs>}
	 */
	async saveGlobalPreferences(preferences: GPrefs): Promise<GPrefs> {
		this.logger.info('Saving global preferences');
		return this.storageProvider.saveGlobalPreferences(preferences) as Promise<GPrefs>;
	}

	/**
	 * Saves the meet room to the storage provider.
	 *
	 * @param meetRoom - The meeting room object to be saved
	 * @returns A promise that resolves to the saved meeting room object
	 */
	async saveMeetRoom(meetRoom: MRoom): Promise<MRoom> {
		this.logger.info(`Saving OpenVidu room ${meetRoom.roomId}`);
		return this.storageProvider.saveMeetRoom(meetRoom) as Promise<MRoom>;
	}

	/**
	 * Retrieves a paginated list of meeting rooms from the storage provider.
	 *
	 * @param maxItems - Optional maximum number of rooms to retrieve in a single request
	 * @param nextPageToken - Optional token for pagination to get the next page of results
	 * @returns A promise that resolves to an object containing:
	 *   - rooms: Array of MRoom objects representing the meeting rooms
	 *   - isTruncated: Boolean indicating if there are more results available
	 *   - nextPageToken: Optional token for retrieving the next page of results
	 */
	async getMeetRooms(
		maxItems?: number,
		nextPageToken?: string
	): Promise<{
		rooms: MRoom[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		return this.storageProvider.getMeetRooms(maxItems, nextPageToken) as Promise<{
			rooms: MRoom[];
			isTruncated: boolean;
			nextPageToken?: string;
		}>;
	}

	/**
	 * Retrieves the preferences associated with a specific room.
	 *
	 * @param roomId - The unique identifier for the room.
	 * @returns A promise that resolves to the room's preferences.
	 * @throws Error if the room preferences are not found.
	 */
	async getMeetRoom(roomId: string): Promise<MRoom> {
		const meetRoom = await this.storageProvider.getMeetRoom(roomId);

		if (!meetRoom) {
			this.logger.error(`Room not found for room ${roomId}`);
			throw errorRoomNotFound(roomId);
		}

		return meetRoom as MRoom;
	}

	/**
	 * Deletes multiple meeting rooms from storage.
	 *
	 * @param roomIds - Array of room identifiers to be deleted
	 * @returns A promise that resolves when all rooms have been successfully deleted
	 * @throws May throw an error if the deletion operation fails for any of the rooms
	 */
	async deleteMeetRooms(roomIds: string[]): Promise<void> {
		return this.storageProvider.deleteMeetRooms(roomIds);
	}

	/**
	 * Retrieves metadata for an archived room by its ID.
	 *
	 * @param roomId - The unique identifier of the room to retrieve metadata for
	 * @returns A promise that resolves to partial room metadata if found, or null if not found
	 */
	async getArchivedRoomMetadata(roomId: string): Promise<Partial<MRoom> | null> {
		return this.storageProvider.getArchivedRoomMetadata(roomId) as Promise<Partial<MRoom> | null>;
	}

	/**
	 * Archives the metadata for a specific room.
	 *
	 * @param roomId - The unique identifier of the room whose metadata should be archived
	 * @returns A Promise that resolves when the archival operation is complete
	 * @throws May throw an error if the archival operation fails or if the room ID is invalid
	 */
	async archiveRoomMetadata(roomId: string): Promise<void> {
		return this.storageProvider.archiveRoomMetadata(roomId);
	}

	/**
	 * Updates the metadata of an archived room.
	 *
	 * @param roomId - The unique identifier of the room whose archived metadata should be updated
	 * @returns A promise that resolves when the archived room metadata has been successfully updated
	 * @throws May throw an error if the room ID is invalid or if the storage operation fails
	 */
	async updateArchivedRoomMetadata(roomId: string): Promise<void> {
		return this.storageProvider.updateArchivedRoomMetadata(roomId);
	}

	/**
	 * Deletes the archived metadata for a specific room.
	 *
	 * @param roomId - The unique identifier of the room whose archived metadata should be deleted
	 * @returns A promise that resolves when the archived room metadata has been successfully deleted
	 * @throws May throw an error if the deletion operation fails or if the room ID is invalid
	 */
	async deleteArchivedRoomMetadata(roomId: string): Promise<void> {
		return this.storageProvider.deleteArchivedRoomMetadata(roomId);
	}

	/**
	 * Saves recording metadata to the storage provider.
	 *
	 * @param recordingInfo - The recording metadata object to be saved
	 * @returns A promise that resolves to the saved recording metadata object
	 */
	async saveRecordingMetadata(recordingInfo: MRec): Promise<MRec> {
		return this.storageProvider.saveRecordingMetadata(recordingInfo) as Promise<MRec>;
	}

	/**
	 * Retrieves the metadata for a specific recording.
	 *
	 * @param recordingId - The unique identifier of the recording
	 * @returns A promise that resolves to an object containing the recording information and metadata file path
	 * @throws May throw an error if the recording is not found or if there's an issue accessing the storage provider
	 */
	async getRecordingMetadata(recordingId: string): Promise<{ recordingInfo: MRec; metadataFilePath: string }> {
		return this.storageProvider.getRecordingMetadata(recordingId) as Promise<{
			recordingInfo: MRec;
			metadataFilePath: string;
		}>;
	}

	/**
	 * Retrieves metadata for recordings by their file path.
	 *
	 * @param recordingPath - The path of the recording file to retrieve metadata for
	 * @returns A promise that resolves to
	 */
	async getRecordingMetadataByPath(recordingPath: string): Promise<MRec | undefined> {
		return this.storageProvider.getRecordingMetadataByPath(recordingPath) as Promise<MRec>;
	}

	/**
	 * Retrieves recording media as a readable stream from the storage provider.
	 *
	 * @param recordingPath - The path to the recording file in storage
	 * @param range - Optional byte range for partial content retrieval
	 * @param range.start - Starting byte position
	 * @param range.end - Ending byte position
	 * @returns A Promise that resolves to a Readable stream of the recording media
	 */
	async getRecordingMedia(
		recordingPath: string,
		range?: {
			end: number;
			start: number;
		}
	): Promise<Readable> {
		return this.storageProvider.getRecordingMedia(recordingPath, range) as Promise<Readable>;
	}

	/**
	 * Deletes multiple recording metadata files by their paths.
	 *
	 * @param metadataPaths - Array of file paths to the recording metadata files to be deleted
	 * @returns A Promise that resolves when all metadata files have been successfully deleted
	 * @throws May throw an error if any of the deletion operations fail
	 */
	async deleteRecordingMetadataByPaths(metadataPaths: string[]): Promise<void> {
		return this.storageProvider.deleteRecordingMetadataByPaths(metadataPaths);
	}

	/**
	 * Deletes recording binary files from storage using the provided file paths.
	 *
	 * @param recordingPaths - Array of file paths pointing to the recording binary files to be deleted
	 * @returns A Promise that resolves when all specified recording files have been successfully deleted
	 * @throws May throw an error if any of the file deletion operations fail
	 */
	async deleteRecordingBinaryFilesByPaths(recordingPaths: string[]): Promise<void> {
		return this.storageProvider.deleteRecordingBinaryFilesByPaths(recordingPaths);
	}

	/**
	 * Returns the default global preferences.
	 * @returns {GPrefs}
	 */
	protected async getDefaultPreferences(): Promise<GPrefs> {
		return {
			projectId: MEET_NAME_ID,
			webhooksPreferences: {
				enabled: MEET_WEBHOOK_ENABLED === 'true',
				url: MEET_WEBHOOK_URL
			},
			securityPreferences: {
				roomCreationPolicy: {
					allowRoomCreation: true,
					requireAuthentication: true
				},
				authentication: {
					authMode: AuthMode.NONE,
					method: {
						type: AuthType.SINGLE_USER,
						credentials: {
							username: MEET_USER,
							passwordHash: await PasswordHelper.hashPassword(MEET_SECRET)
						}
					}
				}
			}
		} as GPrefs;
	}

	/**
	 * Handles errors and logs them.
	 * @param {any} error
	 * @param {string} message
	 */
	protected handleError(error: OpenViduMeetError | unknown, message: string) {
		if (error instanceof OpenViduMeetError) {
			this.logger.error(`${message}: ${error.message}`);
		} else {
			this.logger.error(`${message}: Unexpected error`);
		}
	}
}
