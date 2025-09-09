import { Injectable } from '@angular/core';
import { FeatureConfigurationService, HttpService, ParticipantService, SessionStorageService } from '@lib/services';
import {
	MeetRoom,
	MeetRoomConfig,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomDeletionSuccessCode,
	MeetRoomFilters,
	MeetRoomOptions,
	MeetRoomRoleAndPermissions,
	MeetRoomStatus
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

	setRoomSecret(secret: string, updateStorage = true) {
		this.roomSecret = secret;
		if (updateStorage) {
			this.sessionStorageService.setRoomSecret(this.roomId, secret);
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
			if (filters.roomName) {
				queryParams.set('roomName', filters.roomName);
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
		const path = `${this.ROOMS_API}/${roomId}`;
		const headers = this.participantService.getParticipantRoleHeader();
		return this.httpService.getRequest(path, headers);
	}

	/**
	 * Updates the status of a room.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param status - The new status to be set
	 * @return A promise that resolves to an object containing the updated room and a status code
	 */
	async updateRoomStatus(roomId: string, status: MeetRoomStatus): Promise<{ message: string; room: MeetRoom }> {
		const path = `${this.ROOMS_API}/${roomId}/status`;
		return this.httpService.putRequest(path, { status });
	}

	/**
	 * Deletes a room by its ID.
	 *
	 * @param roomId - The unique identifier of the room to be deleted
	 * @param withMeeting - Policy for handling rooms with active meetings
	 * @param withRecordings - Policy for handling rooms with recordings
	 * @return A promise that resolves to an object containing the success code and message
	 */
	async deleteRoom(
		roomId: string,
		withMeeting: MeetRoomDeletionPolicyWithMeeting = MeetRoomDeletionPolicyWithMeeting.FAIL,
		withRecordings: MeetRoomDeletionPolicyWithRecordings = MeetRoomDeletionPolicyWithRecordings.FAIL
	): Promise<{ successCode: MeetRoomDeletionSuccessCode; message: string; room?: MeetRoom }> {
		const queryParams = new URLSearchParams();
		queryParams.set('withMeeting', withMeeting);
		queryParams.set('withRecordings', withRecordings);

		const path = `${this.ROOMS_API}/${roomId}?${queryParams.toString()}`;
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Bulk deletes rooms by their IDs.
	 *
	 * @param roomIds - An array of room IDs to be deleted
	 * @param withMeeting - Policy for handling rooms with active meetings
	 * @param withRecordings - Policy for handling rooms with recordings
	 * @return A promise that resolves when the rooms have been deleted
	 */
	async bulkDeleteRooms(
		roomIds: string[],
		withMeeting: MeetRoomDeletionPolicyWithMeeting = MeetRoomDeletionPolicyWithMeeting.FAIL,
		withRecordings: MeetRoomDeletionPolicyWithRecordings = MeetRoomDeletionPolicyWithRecordings.FAIL
	): Promise<{
		message: string;
		successful: { roomId: string; successCode: MeetRoomDeletionSuccessCode; message: string; room?: MeetRoom }[];
	}> {
		if (roomIds.length === 0) {
			throw new Error('No room IDs provided for bulk deletion');
		}

		const queryParams = new URLSearchParams();
		queryParams.set('roomIds', roomIds.join(','));
		queryParams.set('withMeeting', withMeeting);
		queryParams.set('withRecordings', withRecordings);

		const path = `${this.ROOMS_API}?${queryParams.toString()}`;
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Retrieves the config for a specific room.
	 *
	 * @param roomId - The unique identifier of the room
	 * @return A promise that resolves to the MeetRoomConfig object
	 */
	async getRoomConfig(roomId: string): Promise<MeetRoomConfig> {
		this.log.d('Fetching room config for roomId:', roomId);

		try {
			const path = `${this.ROOMS_API}/${roomId}/config`;
			const headers = this.participantService.getParticipantRoleHeader();
			const config = await this.httpService.getRequest<MeetRoomConfig>(path, headers);
			return config;
		} catch (error) {
			this.log.e('Error fetching room config', error);
			throw new Error(`Failed to fetch room config for roomId: ${roomId}`);
		}
	}

	/**
	 * Loads the room config and updates the feature configuration service.
	 *
	 * @param roomId - The unique identifier of the room
	 */
	async loadRoomConfig(roomId: string): Promise<void> {
		try {
			const config = await this.getRoomConfig(roomId);
			this.featureConfService.setRoomConfig(config);
			console.log('Room config loaded:', config);
		} catch (error) {
			this.log.e('Error loading room config', error);
			throw new Error('Failed to load room config');
		}
	}

	/**
	 * Saves new room config.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param config - The room config to be saved.
	 * @returns A promise that resolves when the config have been saved.
	 */
	async updateRoomConfig(roomId: string, config: MeetRoomConfig): Promise<void> {
		this.log.d('Saving room config', config);
		const path = `${this.ROOMS_API}/${roomId}/config`;
		await this.httpService.putRequest(path, { config });
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
