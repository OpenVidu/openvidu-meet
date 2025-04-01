/**
 * Service that provides high-level methods for managing application preferences,
 * regardless of the underlying storage mechanism.
 */

import { AuthMode, AuthType, GlobalPreferences, MeetRoom, MeetRoomPreferences } from '@typings-ce';
import { LoggerService } from '../logger.service.js';
import { PreferencesStorage } from './global-preferences-storage.interface.js';
import { GlobalPreferencesStorageFactory } from './global-preferences.factory.js';
import { errorRoomNotFound, OpenViduMeetError } from '../../models/error.model.js';
import { MEET_NAME_ID, MEET_SECRET, MEET_USER, MEET_WEBHOOK_ENABLED, MEET_WEBHOOK_URL } from '../../environment.js';
import { injectable, inject } from '../../config/dependency-injector.config.js';
import { PasswordHelper } from '../../helpers/password.helper.js';

@injectable()
export class GlobalPreferencesService<
	G extends GlobalPreferences = GlobalPreferences,
	R extends MeetRoom = MeetRoom
> {
	protected storage: PreferencesStorage;
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(GlobalPreferencesStorageFactory) protected storageFactory: GlobalPreferencesStorageFactory
	) {
		this.storage = this.storageFactory.create();
	}

	/**
	 * Initializes default preferences if not already initialized.
	 * @returns {Promise<G>} Default global preferences.
	 */
	async ensurePreferencesInitialized(): Promise<G> {
		const preferences = await this.getDefaultPreferences();

		try {
			await this.storage.initialize(preferences);
			return preferences as G;
		} catch (error) {
			this.handleError(error, 'Error initializing default preferences');
			return Promise.resolve({} as G);
		}
	}

	/**
	 * Retrieves the global preferences, initializing them if necessary.
	 * @returns {Promise<GlobalPreferences>}
	 */
	async getGlobalPreferences(): Promise<G> {
		const preferences = await this.storage.getGlobalPreferences();

		if (preferences) return preferences as G;

		return await this.ensurePreferencesInitialized();
	}

	/**
	 * Saves the global preferences.
	 * @param {GlobalPreferences} preferences
	 * @returns {Promise<GlobalPreferences>}
	 */
	async saveGlobalPreferences(preferences: G): Promise<G> {
		this.logger.info('Saving global preferences');
		return this.storage.saveGlobalPreferences(preferences) as Promise<G>;
	}

	async saveOpenViduRoom(ovRoom: R): Promise<R> {
		this.logger.info(`Saving OpenVidu room ${ovRoom.roomId}`);
		return this.storage.saveOpenViduRoom(ovRoom) as Promise<R>;
	}

	async getOpenViduRooms(): Promise<R[]> {
		return this.storage.getOpenViduRooms() as Promise<R[]>;
	}

	/**
	 * Retrieves the preferences associated with a specific room.
	 *
	 * @param roomId - The unique identifier for the room.
	 * @returns A promise that resolves to the room's preferences.
	 * @throws Error if the room preferences are not found.
	 */
	async getOpenViduRoom(roomId: string): Promise<R> {
		const openviduRoom = await this.storage.getOpenViduRoom(roomId);

		if (!openviduRoom) {
			this.logger.error(`Room not found for room ${roomId}`);
			throw errorRoomNotFound(roomId);
		}

		return openviduRoom as R;
	}

	async deleteOpenViduRoom(roomId: string): Promise<void> {
		return this.storage.deleteOpenViduRoom(roomId);
	}

	async getOpenViduRoomPreferences(roomId: string): Promise<MeetRoomPreferences> {
		const openviduRoom = await this.getOpenViduRoom(roomId);

		if (!openviduRoom.preferences) {
			throw new Error('Room preferences not found');
		}

		return openviduRoom.preferences;
	}

	/**
	 * Updates room preferences in storage.
	 * @param {RoomPreferences} roomPreferences
	 * @returns {Promise<GlobalPreferences>}
	 */
	async updateOpenViduRoomPreferences(roomId: string, roomPreferences: MeetRoomPreferences): Promise<R> {
		// TODO: Move validation to the controller layer
		this.validateRoomPreferences(roomPreferences);

		const openviduRoom = await this.getOpenViduRoom(roomId);
		openviduRoom.preferences = roomPreferences;
		return this.saveOpenViduRoom(openviduRoom);
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
	protected handleError(error: any, message: string) {
		if (error instanceof OpenViduMeetError) {
			this.logger.error(`${message}: ${error.message}`);
		} else {
			this.logger.error(`${message}: Unexpected error`);
		}
	}
}
