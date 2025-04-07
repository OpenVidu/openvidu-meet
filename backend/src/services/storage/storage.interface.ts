import { GlobalPreferences, MeetRoom } from '@typings-ce';

/**
 * An interface that defines the contract for storage providers in the OpenVidu Meet application.
 * Storage providers handle persistence of global application preferences and meeting room data.
 *
 * @template T - The type of global preferences, extending GlobalPreferences
 * @template R - The type of room data, extending MeetRoom
 *
 * Implementations of this interface should handle the persistent storage
 * of application settings and room information, which could be backed by
 * various storage solutions (database, file system, cloud storage, etc.).
 */
export interface StorageProvider<T extends GlobalPreferences = GlobalPreferences, R extends MeetRoom = MeetRoom> {
	/**
	 * Initializes the storage with default preferences if they are not already set.
	 *
	 * @param defaultPreferences - The default preferences to initialize with.
	 * @returns A promise that resolves when the initialization is complete.
	 */
	initialize(defaultPreferences: T): Promise<void>;

	/**
	 * Retrieves the global preferences of Openvidu Meet.
	 *
	 * @returns A promise that resolves to the global preferences, or null if not set.
	 */
	getGlobalPreferences(): Promise<T | null>;

	/**
	 * Saves the given preferences.
	 *
	 * @param preferences - The preferences to save.
	 * @returns A promise that resolves to the saved preferences.
	 */
	saveGlobalPreferences(preferences: T): Promise<T>;

	/**
	 *
	 * Retrieves the OpenVidu Meet Rooms.
	 *
	 * @param maxItems - The maximum number of items to retrieve. If not provided, all items will be retrieved.
	 * @param nextPageToken - The token for the next page of results. If not provided, the first page will be retrieved.
	 * @returns A promise that resolves to an object containing ç
	 * 	- the retrieved rooms,
	 *  - a boolean indicating if there are more items to retrieve
	 * 	- an optional next page token.
	 */
	getMeetRooms(
		maxItems?: number,
		nextPageToken?: string
	): Promise<{
		rooms: R[];
		isTruncated: boolean;
		nextPageToken?: string;
	}>;

	/**
	 * Retrieves the {@link MeetRoom}.
	 *
	 * @param roomId - The name of the room to retrieve.
	 * @returns A promise that resolves to the OpenVidu Room, or null if not found.
	 **/
	getMeetRoom(roomId: string): Promise<R | null>;

	/**
	 * Saves the OpenVidu Meet Room.
	 *
	 * @param ovRoom - The OpenVidu Room to save.
	 * @returns A promise that resolves to the saved
	 **/
	saveMeetRoom(ovRoom: R): Promise<R>;

	/**
	 * Deletes the OpenVidu Meet Room for a given room name.
	 *
	 * @param roomId - The name of the room whose should be deleted.
	 * @returns A promise that resolves when the room have been deleted.
	 **/
	deleteMeetRoom(roomId: string): Promise<void>;
}
