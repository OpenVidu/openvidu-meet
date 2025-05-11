import { AuthMode, AuthType, GlobalPreferences, MeetRoom } from '@typings-ce';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { MEET_NAME_ID, MEET_SECRET, MEET_USER, MEET_WEBHOOK_ENABLED, MEET_WEBHOOK_URL } from '../../environment.js';
import { MeetLock, PasswordHelper } from '../../helpers/index.js';
import { errorRoomNotFound, internalError, OpenViduMeetError } from '../../models/error.model.js';
import { LoggerService, MutexService, StorageFactory, StorageProvider } from '../index.js';

/**
 * A service for managing storage operations related to OpenVidu Meet rooms and preferences.
 *
 * This service provides an abstraction layer over the underlying storage implementation,
 * handling initialization, retrieval, and persistence of global preferences and room data.
 *
 * @typeParam G - Type for global preferences, extends GlobalPreferences
 * @typeParam R - Type for room data, extends MeetRoom
 */
@injectable()
export class MeetStorageService<G extends GlobalPreferences = GlobalPreferences, R extends MeetRoom = MeetRoom> {
	protected storageProvider: StorageProvider;
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(StorageFactory) protected storageFactory: StorageFactory,
		@inject(MutexService) protected mutexService: MutexService
	) {
		this.storageProvider = this.storageFactory.create();
	}

	/**
	 * Initializes default preferences if not already initialized.
	 * @returns {Promise<G>} Default global preferences.
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
	 * @returns {Promise<GlobalPreferences>}
	 */
	async getGlobalPreferences(): Promise<G> {
		let preferences = await this.storageProvider.getGlobalPreferences();

		if (preferences) return preferences as G;

		await this.initializeGlobalPreferences();
		preferences = await this.storageProvider.getGlobalPreferences();

		if (!preferences) {
			this.logger.error('Global preferences not found after initialization');
			throw internalError('getting global preferences');
		}

		return preferences as G;
	}

	/**
	 * Saves the global preferences.
	 * @param {GlobalPreferences} preferences
	 * @returns {Promise<GlobalPreferences>}
	 */
	async saveGlobalPreferences(preferences: G): Promise<G> {
		this.logger.info('Saving global preferences');
		return this.storageProvider.saveGlobalPreferences(preferences) as Promise<G>;
	}

	async saveMeetRoom(meetRoom: R): Promise<R> {
		this.logger.info(`Saving OpenVidu room ${meetRoom.roomId}`);
		return this.storageProvider.saveMeetRoom(meetRoom) as Promise<R>;
	}

	async getMeetRooms(
		maxItems?: number,
		nextPageToken?: string
	): Promise<{
		rooms: R[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		return this.storageProvider.getMeetRooms(maxItems, nextPageToken) as Promise<{
			rooms: R[];
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
	async getMeetRoom(roomId: string): Promise<R> {
		const meetRoom = await this.storageProvider.getMeetRoom(roomId);

		if (!meetRoom) {
			this.logger.error(`Room not found for room ${roomId}`);
			throw errorRoomNotFound(roomId);
		}

		return meetRoom as R;
	}

	async deleteMeetRooms(roomIds: string[]): Promise<void> {
		return this.storageProvider.deleteMeetRooms(roomIds);
	}

	async getArchivedRoomMetadata(roomId: string): Promise<Partial<R> | null> {
		return this.storageProvider.getArchivedRoomMetadata(roomId) as Promise<Partial<R> | null>;
	}

	async archiveRoomMetadata(roomId: string): Promise<void> {
		return this.storageProvider.archiveRoomMetadata(roomId);
	}

	async updateArchivedRoomMetadata(roomId: string): Promise<void> {
		return this.storageProvider.updateArchivedRoomMetadata(roomId);
	}

	/**
	 * Returns the default global preferences.
	 * @returns {G}
	 */
	protected async getDefaultPreferences(): Promise<G> {
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
		} as G;
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
