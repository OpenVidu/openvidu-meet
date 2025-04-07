import { AuthMode, AuthType, GlobalPreferences, MeetRoom, MeetRoomPreferences } from '@typings-ce';
import { LoggerService } from '../logger.service.js';
import { StorageProvider } from './storage.interface.js';
import { StorageFactory } from './storage.factory.js';
import { errorRoomNotFound, OpenViduMeetError } from '../../models/error.model.js';
import { MEET_NAME_ID, MEET_SECRET, MEET_USER, MEET_WEBHOOK_ENABLED, MEET_WEBHOOK_URL } from '../../environment.js';
import { injectable, inject } from '../../config/dependency-injector.config.js';
import { PasswordHelper } from '../../helpers/password.helper.js';
import { MutexService } from '../mutex.service.js';
import { MeetLock } from '../../helpers/redis.helper.js';
import ms from 'ms';

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
		const preferences = await this.storageProvider.getGlobalPreferences();

		if (preferences) return preferences as G;

		await this.initializeGlobalPreferences();

		return this.storageProvider.getGlobalPreferences() as Promise<G>;
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

	async deleteMeetRoom(roomId: string): Promise<void> {
		return this.storageProvider.deleteMeetRoom(roomId);
	}

	//TODO: REMOVE THIS METHOD
	async getOpenViduRoomPreferences(roomId: string): Promise<MeetRoomPreferences> {
		const openviduRoom = await this.getMeetRoom(roomId);

		if (!openviduRoom.preferences) {
			throw new Error('Room preferences not found');
		}

		return openviduRoom.preferences;
	}

	/**
	 * TODO: Move validation to the controller layer
	 * Updates room preferences in storage.
	 * @param {RoomPreferences} roomPreferences
	 * @returns {Promise<GlobalPreferences>}
	 */
	async updateOpenViduRoomPreferences(roomId: string, roomPreferences: MeetRoomPreferences): Promise<R> {
		this.validateRoomPreferences(roomPreferences);

		const openviduRoom = await this.getMeetRoom(roomId);
		openviduRoom.preferences = roomPreferences;
		return this.saveMeetRoom(openviduRoom);
	}

	/**
	 * Validates the room preferences.
	 * @param {RoomPreferences} preferences
	 */
	validateRoomPreferences(preferences: MeetRoomPreferences) {
		const { recordingPreferences, chatPreferences, virtualBackgroundPreferences } = preferences;

		if (!recordingPreferences || !chatPreferences || !virtualBackgroundPreferences) {
			throw new Error('All room preferences must be provided');
		}

		if (typeof preferences.recordingPreferences.enabled !== 'boolean') {
			throw new Error('Invalid value for recordingPreferences.enabled');
		}

		if (typeof preferences.chatPreferences.enabled !== 'boolean') {
			throw new Error('Invalid value for chatPreferences.enabled');
		}

		if (typeof preferences.virtualBackgroundPreferences.enabled !== 'boolean') {
			throw new Error('Invalid value for virtualBackgroundPreferences.enabled');
		}
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
