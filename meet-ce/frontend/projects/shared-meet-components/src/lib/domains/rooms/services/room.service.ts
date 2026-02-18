import { inject, Injectable } from '@angular/core';
import {
	MeetRoom,
	MeetRoomAnonymousConfig,
	MeetRoomConfig,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomDeletionSuccessCode,
	MeetRoomFilters,
	MeetRoomOptions,
	MeetRoomRolesConfig,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { HttpService } from '../../../shared/services/http.service';
import { MeetRoomClientResponseOptions } from '../models/room-request';
import { RoomFeatureService } from './room-feature.service';

@Injectable({
	providedIn: 'root'
})
export class RoomService {
	protected readonly ROOMS_API = `${HttpService.API_PATH_PREFIX}/rooms`;
	protected readonly INTERNAL_ROOMS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/rooms`;

	protected httpService: HttpService = inject(HttpService);
	protected loggerService: LoggerService = inject(LoggerService);
	protected roomFeatureService: RoomFeatureService = inject(RoomFeatureService);

	protected log: ILogger = this.loggerService.get('OpenVidu Meet - RoomService');

	constructor() {}

	/**
	 * Creates a new room with the specified options.
	 *
	 * @param options - The options for creating the room
	 * @returns A promise that resolves to the created MeetRoom object
	 */
	async createRoom(options?: MeetRoomOptions, responseOptions?: MeetRoomClientResponseOptions): Promise<MeetRoom> {
		const headers: Record<string, string> = {
			'X-Fields': responseOptions?.fields ? responseOptions.fields.join(',') : '',
			'X-ExtraFields': responseOptions?.extraFields ? responseOptions.extraFields.join(',') : ''
		};
		return this.httpService.postRequest(this.ROOMS_API, options, headers);
	}

	/**
	 * Lists rooms with optional filters.
	 *
	 * @param filters - Optional filters
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

			Object.entries(filters).forEach(([key, value]) => {
				if (value) {
					const stringValue = Array.isArray(value) ? value.join(',') : value.toString();
					queryParams.set(key, stringValue);
				}
			});

			const queryString = queryParams.toString();
			if (queryString) {
				path += `?${queryString}`;
			}
		}

		return this.httpService.getRequest(path);
	}

	/**
	 * Gets a room by its ID.
	 *
	 * @param roomId - The unique identifier of the room
	 * @return A promise that resolves to the MeetRoom object
	 */
	async getRoom(roomId: string, responseOptions?: MeetRoomClientResponseOptions): Promise<MeetRoom> {
		const queryParams = new URLSearchParams();
		if (responseOptions?.fields) {
			queryParams.set('fields', responseOptions.fields.join(','));
		}
		if (responseOptions?.extraFields) {
			queryParams.set('extraFields', responseOptions.extraFields.join(','));
		}
		const queryString = queryParams.toString();
		const path = `${this.ROOMS_API}/${roomId}${queryString ? `?${queryString}` : ''}`;

		return this.httpService.getRequest(path);
	}

	/**
	 * Retrieves the config for a specific room.
	 *
	 * @param roomId - The unique identifier of the room
	 * @return A promise that resolves to the MeetRoomConfig object
	 */
	async getRoomConfig(roomId: string): Promise<MeetRoomConfig> {
		const path = `${this.ROOMS_API}/${roomId}/config`;
		return this.httpService.getRequest<MeetRoomConfig>(path);
	}

	/**
	 * Loads the room config and updates the feature configuration service.
	 *
	 * @param roomId - The unique identifier of the room
	 */
	async loadRoomConfig(roomId: string): Promise<void> {
		this.log.d('Fetching room config for roomId:', roomId);

		try {
			const config = await this.getRoomConfig(roomId);
			this.roomFeatureService.setRoomConfig(config);
			this.log.d('Room config loaded:', config);
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
	async updateRoomConfig(roomId: string, config: Partial<MeetRoomConfig>): Promise<void> {
		this.log.d('Saving room config', config);
		const path = `${this.ROOMS_API}/${roomId}/config`;
		await this.httpService.putRequest(path, { config });
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
	 * Updates the roles permissions of a room.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param rolesConfig - The new roles configuration to be set
	 * @returns A promise that resolves when the roles configuration has been updated
	 */
	async updateRoomRoles(roomId: string, rolesConfig: MeetRoomRolesConfig): Promise<void> {
		const path = `${this.ROOMS_API}/${roomId}/roles`;
		return this.httpService.putRequest(path, { roles: rolesConfig });
	}

	/**
	 * Updates the anonymous access configuration of a room.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param anonymousConfig - The new anonymous access configuration to be set
	 * @returns A promise that resolves when the anonymous access configuration has been updated
	 */
	async updateRoomAnonymous(roomId: string, anonymousConfig: MeetRoomAnonymousConfig): Promise<void> {
		const path = `${this.ROOMS_API}/${roomId}/anonymous`;
		return this.httpService.putRequest(path, { anonymous: anonymousConfig });
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
}
