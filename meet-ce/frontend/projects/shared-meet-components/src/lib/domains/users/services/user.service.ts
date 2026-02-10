import { Injectable } from '@angular/core';
import { MeetUserDTO, MeetUserFilters, MeetUserOptions, MeetUserRole } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';

@Injectable({
	providedIn: 'root'
})
export class UserService {
	protected readonly USERS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/users`;

	constructor(protected httpService: HttpService) {}

	/**
	 * Creates a new user with the specified options.
	 *
	 * @param options - The options for creating the user
	 * @returns A promise that resolves to the created MeetUserDTO object
	 */
	async createUser(options: MeetUserOptions): Promise<MeetUserDTO> {
		return this.httpService.postRequest(this.USERS_API, options);
	}

	/**
	 * Lists users with optional filters.
	 *
	 * @param filters - Optional filters
	 * @return A promise that resolves to an object containing users and pagination info
	 */
	async listUsers(filters?: MeetUserFilters): Promise<{
		users: MeetUserDTO[];
		pagination: {
			isTruncated: boolean;
			nextPageToken?: string;
			maxItems: number;
		};
	}> {
		let path = this.USERS_API;

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
	 * Gets a user by their ID.
	 *
	 * @param userId - The unique identifier of the user
	 * @returns A promise that resolves to the MeetUserDTO object
	 */
	async getUser(userId: string): Promise<MeetUserDTO> {
		const path = `${this.USERS_API}/${userId}`;
		return this.httpService.getRequest(path);
	}

	/**
	 * Gets the currently authenticated user's information.
	 *
	 * @returns A promise that resolves to the MeetUserDTO of the authenticated user
	 */
	async getMe(): Promise<MeetUserDTO> {
		return this.httpService.getRequest(`${this.USERS_API}/me`);
	}

	/**
	 * Resets a user's password.
	 *
	 * @param userId - The unique identifier of the user
	 * @param newPassword - The new password to set
	 * @returns A promise that resolves when the password reset is successful
	 */
	async resetUserPassword(userId: string, newPassword: string): Promise<{ message: string }> {
		const path = `${this.USERS_API}/${userId}/password`;
		return this.httpService.putRequest(path, { newPassword });
	}

	/**
	 * Changes the password of the currently authenticated user.
	 *
	 * @param currentPassword - The current password of the user
	 * @param newPassword - The new password to set
	 * @returns A promise that resolves when the password change is successful
	 */
	async changePassword(currentPassword: string, newPassword: string): Promise<any> {
		const path = `${this.USERS_API}/change-password`;
		return this.httpService.postRequest(path, { currentPassword, newPassword });
	}

	/**
	 * Updates a user's role.
	 *
	 * @param userId - The unique identifier of the user
	 * @param role - The new role to assign to the user
	 * @returns A promise that resolves to the updated MeetUserDTO object
	 */
	async updateUserRole(userId: string, role: MeetUserRole): Promise<MeetUserDTO> {
		const path = `${this.USERS_API}/${userId}/role`;
		return this.httpService.putRequest(path, { role });
	}

	/**
	 * Deletes a user by their ID.
	 *
	 * @param userId - The unique identifier of the user to delete
	 * @returns A promise that resolves when the user is deleted
	 */
	async deleteUser(userId: string): Promise<any> {
		const path = `${this.USERS_API}/${userId}`;
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Bulk deletes multiple users by their IDs.
	 *
	 * @param userIds - An array of user IDs to delete
	 * @returns A promise that resolves when the users are deleted
	 */
	async bulkDeleteUsers(userIds: string[]): Promise<{
		message: string;
		deleted: string[];
	}> {
		if (userIds.length === 0) {
			throw new Error('No user IDs provided for bulk deletion');
		}

		const path = `${this.USERS_API}?userIds=${userIds.join(',')}`;
		return this.httpService.deleteRequest(path);
	}
}
