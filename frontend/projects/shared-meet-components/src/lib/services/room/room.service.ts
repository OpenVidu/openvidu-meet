import { Injectable } from '@angular/core';
import { MeetRoomPreferences } from '@lib/typings/ce';
import { LoggerService } from 'openvidu-components-angular';
import { HttpService } from '../http/http.service';
import { MeetRoom, MeetRoomOptions } from 'projects/shared-meet-components/src/lib/typings/ce/room';

@Injectable({
	providedIn: 'root'
})
export class RoomService {
	protected log;
	protected roomPreferences: MeetRoomPreferences | undefined;
	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomService');
	}

	async createRoom(): Promise<MeetRoom> {
		// TODO: Improve expiration date
		const options: MeetRoomOptions = {
			roomIdPrefix: 'TestRoom-',
			autoDeletionDate: Date.now() + 1000 * 60 * 60 // 1 hour from now
		};
		this.log.d('Creating room', options);
		return this.httpService.createRoom(options);
	}

	async deleteRoom(roomId: string) {
		return this.httpService.deleteRoom(roomId);
	}

	async listRooms() {
		return this.httpService.listRooms();
	}

	async getRoom(roomId: string) {
		return this.httpService.getRoom(roomId);
	}

	async getRoomPreferences(): Promise<MeetRoomPreferences> {
		if (!this.roomPreferences) {
			this.log.d('Room preferences not found, fetching from server');
			// Fetch the room preferences from the server
			this.roomPreferences = await this.httpService.getRoomPreferences();
		}

		return this.roomPreferences;
	}

	/**
	 * Retrieves the moderator and publisher secrets for a specified room.
	 *
	 * This method fetches room information and extracts the secret parameters
	 * from the moderator and publisher room URLs.
	 *
	 * @param roomId - The unique identifier of the room
	 * @returns A promise that resolves to an object containing both secrets
	 * @returns moderatorSecret - The secret parameter extracted from the moderator room URL
	 * @returns publisherSecret - The secret parameter extracted from the publisher room URL
	 */
	async getSecrets(roomId: string): Promise<{ moderatorSecret: string; publisherSecret: string }> {
		const { moderatorRoomUrl, publisherRoomUrl } = await this.getRoom(roomId);

		const publisherUrl = new URL(publisherRoomUrl);
		const publisherSecret = publisherUrl.searchParams.get('secret') || '';
		const moderatorUrl = new URL(moderatorRoomUrl);
		const moderatorSecret = moderatorUrl.searchParams.get('secret') || '';
		return { publisherSecret, moderatorSecret };
	}

	/**
	 * Saves the room preferences.
	 *
	 * @param {RoomPreferences} preferences - The preferences to be saved.
	 * @returns {Promise<void>} A promise that resolves when the preferences have been saved.
	 */
	async saveRoomPreferences(roomId: string, preferences: MeetRoomPreferences): Promise<void> {
		this.log.d('Saving room preferences', preferences);
		await this.httpService.updateRoomPreferences(roomId, preferences);
		this.roomPreferences = preferences;
	}
}
