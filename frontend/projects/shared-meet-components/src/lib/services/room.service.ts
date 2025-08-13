import { Injectable } from '@angular/core';
import { FeatureConfigurationService, HttpService, ParticipantService, SessionStorageService } from '@lib/services';
import {
	MeetRoom,
	MeetRoomFilters,
	MeetRoomOptions,
	MeetRoomPreferences,
	MeetRoomRoleAndPermissions
} from '@lib/typings/ce';
import { LoggerService } from 'openvidu-components-angular';

@Injectable({
	providedIn: 'root'
})
export class RoomService {
	protected readonly ROOMS_API = `${HttpService.API_PATH_PREFIX}/rooms`;
	protected readonly INTERNAL_ROOMS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/rooms`;

	protected roomId: string = '';
	protected roomSecret: string = '';

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService,
		protected participantService: ParticipantService,
		protected featureConfService: FeatureConfigurationService,
		protected sessionStorageService: SessionStorageService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomService');
	}

	setRoomId(roomId: string) {
		this.roomId = roomId;
	}

	getRoomId(): string {
		return this.roomId;
	}

	setRoomSecret(secret?: string) {
		// If no secret is provided, check session storage for the current room's secret
		if (!secret) {
			const storedSecret = this.sessionStorageService.getRoomSecret(this.roomId);
			this.roomSecret = storedSecret || '';
		} else {
			this.roomSecret = secret;
		}
	}

	getRoomSecret(): string {
		return this.roomSecret;
	}

	/**
	 * Creates a new room with the specified options.
	 *
	 * @param options - The options for creating the room
	 * @returns A promise that resolves to the created MeetRoom object
	 */
	async createRoom(options?: MeetRoomOptions): Promise<MeetRoom> {
		return this.httpService.postRequest(this.ROOMS_API, options);
	}

	/**
	 * Lists rooms with optional filters for pagination and fields.
	 *
	 * @param filters - Optional filters for pagination and fields
	 * @return A promise that resolves to an object containing rooms and pagination info
	 */
	async listRooms(filters?: MeetRoomFilters): Promise<{
		rooms: MeetRoom[];
		pagination: {
			isTruncated: boolean;
			nextPageToken?: string;
			maxItems: number;
		};
	}> {
		let path = this.ROOMS_API;

		if (filters) {
			const queryParams = new URLSearchParams();
			if (filters.maxItems) {
				queryParams.set('maxItems', filters.maxItems.toString());
			}
			if (filters.nextPageToken) {
				queryParams.set('nextPageToken', filters.nextPageToken);
			}
			if (filters.fields) {
				queryParams.set('fields', filters.fields);
			}

			path += `?${queryParams.toString()}`;
		}

		return this.httpService.getRequest(path);
	}

	/**
	 * Gets a room by its ID.
	 *
	 * @param roomId - The unique identifier of the room
	 * @return A promise that resolves to the MeetRoom object
	 */
	async getRoom(roomId: string): Promise<MeetRoom> {
		let path = `${this.ROOMS_API}/${roomId}`;
		const headers = this.participantService.getParticipantRoleHeader();
		return this.httpService.getRequest(path, headers);
	}

	/**
	 * Deletes a room by its ID.
	 *
	 * @param roomId - The unique identifier of the room to be deleted
	 * @return A promise that resolves when the room has been deleted
	 */
	async deleteRoom(roomId: string, force = false): Promise<any> {
		let path = `${this.ROOMS_API}/${roomId}`;
		if (force) {
			path += '?force=true';
		}
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Bulk deletes rooms by their IDs.
	 *
	 * @param roomIds - An array of room IDs to be deleted
	 * @return A promise that resolves when the rooms have been deleted
	 */
	async bulkDeleteRooms(roomIds: string[], force = false): Promise<any> {
		if (roomIds.length === 0) {
			throw new Error('No room IDs provided for bulk deletion');
		}

		let path = `${this.ROOMS_API}?roomIds=${roomIds.join(',')}`;
		if (force) {
			path += '&force=true';
		}
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Retrieves the preferences for a specific room.
	 *
	 * @param roomId - The unique identifier of the room
	 * @return A promise that resolves to the MeetRoomPreferences object
	 */
	async getRoomPreferences(roomId: string): Promise<MeetRoomPreferences> {
		this.log.d('Fetching room preferences for roomId:', roomId);

		try {
			const path = `${this.INTERNAL_ROOMS_API}/${roomId}/preferences`;
			const headers = this.participantService.getParticipantRoleHeader();
			const preferences = await this.httpService.getRequest<MeetRoomPreferences>(path, headers);

			if (!preferences) {
				this.log.w('Room preferences not found for roomId:', roomId);
				throw new Error(`Preferences not found for roomId: ${roomId}`);
			}

			return preferences;
		} catch (error) {
			this.log.e('Error fetching room preferences', error);
			throw new Error(`Failed to fetch room preferences for roomId: ${roomId}`);
		}
	}

	/**
	 * Loads the room preferences and updates the feature configuration service.
	 *
	 * @param roomId - The unique identifier of the room
	 */
	async loadRoomPreferences(roomId: string): Promise<void> {
		this.log.d('Fetching room preferences from server');
		try {
			const preferences = await this.getRoomPreferences(roomId);
			this.featureConfService.setRoomPreferences(preferences);
			console.log('Room preferences loaded:', preferences);
		} catch (error) {
			this.log.e('Error loading room preferences', error);
			throw new Error('Failed to load room preferences');
		}
	}

	/**
	 * Saves new room preferences.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param preferences - The room preferences to be saved.
	 * @returns A promise that resolves when the preferences have been saved.
	 */
	async updateRoom(roomId: string, preferences: MeetRoomPreferences): Promise<void> {
		this.log.d('Saving room preferences', preferences);
		const path = `${this.ROOMS_API}/${roomId}`;
		await this.httpService.putRequest(path, preferences);
	}

	/**
	 * Retrieves the role and permissions for a specified room and secret.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param secret - The secret parameter for the room
	 * @returns A promise that resolves to an object containing the role and permissions
	 */
	async getRoomRoleAndPermissions(roomId: string, secret: string): Promise<MeetRoomRoleAndPermissions> {
		const path = `${this.INTERNAL_ROOMS_API}/${roomId}/roles/${secret}`;
		return this.httpService.getRequest(path);
	}
}
