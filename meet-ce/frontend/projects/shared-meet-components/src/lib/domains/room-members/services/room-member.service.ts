import { Injectable } from '@angular/core';
import {
	MeetRoomMember,
	MeetRoomMemberFilters,
	MeetRoomMemberOptions,
	MeetRoomMemberTokenOptions
} from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';

@Injectable({
	providedIn: 'root'
})
export class RoomMemberService {
	protected readonly ROOM_MEMBERS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/rooms`;

	constructor(protected httpService: HttpService) {}

	/**
	 * Constructs the API path for room member operations based on the provided room ID.
	 *
	 * @param roomId - The unique identifier of the room
	 * @returns The API path for room member operations
	 */
	protected getRoomMemberApiPath(roomId: string): string {
		return `${this.ROOM_MEMBERS_API}/${roomId}/members`;
	}

	/**
	 * Creates a new room member with the specified options.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param options - The options for creating the room member
	 * @returns A promise that resolves to the created MeetRoomMember object
	 */
	async createRoomMember(roomId: string, options: MeetRoomMemberOptions): Promise<MeetRoomMember> {
		const path = this.getRoomMemberApiPath(roomId);
		return this.httpService.postRequest(path, options);
	}

	/**
	 * Lists room members with optional filters.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param filters - Optional filters for pagination and fields
	 * @returns A promise that resolves to an object containing room members and pagination info
	 */
	async listRoomMembers(
		roomId: string,
		filters?: MeetRoomMemberFilters
	): Promise<{
		members: MeetRoomMember[];
		pagination: {
			isTruncated: boolean;
			nextPageToken?: string;
			maxItems: number;
		};
	}> {
		let path = this.getRoomMemberApiPath(roomId);

		if (filters) {
			const queryParams = new URLSearchParams();

			Object.entries(filters).forEach(([key, value]) => {
				if (value !== undefined && value !== null) {
					queryParams.set(key, value.toString());
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
	 * Gets a specific room member by their ID.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param memberId - The unique identifier of the room member
	 * @returns A promise that resolves to the MeetRoomMember object
	 */
	async getRoomMember(roomId: string, memberId: string): Promise<MeetRoomMember> {
		const path = `${this.getRoomMemberApiPath(roomId)}/${memberId}`;
		return this.httpService.getRequest(path);
	}

	/**
	 * Updates a room member's information.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param memberId - The unique identifier of the room member
	 * @param updates - The updates to apply to the room member
	 * @returns A promise that resolves to the updated MeetRoomMember object
	 */
	async updateRoomMember(
		roomId: string,
		memberId: string,
		updates: Partial<MeetRoomMemberOptions>
	): Promise<MeetRoomMember> {
		const path = `${this.getRoomMemberApiPath(roomId)}/${memberId}`;
		return this.httpService.putRequest(path, updates);
	}

	/**
	 * Deletes a room member by their ID.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param memberId - The unique identifier of the room member to delete
	 * @returns A promise that resolves when the room member is deleted
	 */
	async deleteRoomMember(roomId: string, memberId: string): Promise<void> {
		const path = `${this.getRoomMemberApiPath(roomId)}/${memberId}`;
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Bulk deletes multiple room members by their IDs.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param memberIds - An array of room member IDs to delete
	 * @returns A promise that resolves when the room members are deleted
	 */
	async bulkDeleteRoomMembers(
		roomId: string,
		memberIds: string[]
	): Promise<{
		message: string;
		deleted: string[];
	}> {
		if (memberIds.length === 0) {
			throw new Error('No room member IDs provided for bulk deletion');
		}

		const path = `${this.getRoomMemberApiPath(roomId)}?memberIds=${memberIds.join(',')}`;
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Generates a room member token for accessing the room and its resources.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param tokenOptions - The options for the token generation
	 * @returns A promise that resolves to an object containing the generated token
	 */
	async generateRoomMemberToken(
		roomId: string,
		tokenOptions: MeetRoomMemberTokenOptions
	): Promise<{ token: string }> {
		const path = `${this.getRoomMemberApiPath(roomId)}/token`;
		return this.httpService.postRequest(path, tokenOptions);
	}
}
