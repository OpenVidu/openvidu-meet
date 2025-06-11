import { Injectable } from '@angular/core';
import { MeetRoomPreferences } from '@lib/typings/ce';
import { LoggerService } from 'openvidu-components-angular';
import { HttpService } from '../http/http.service';
import { MeetRoom, MeetRoomOptions } from 'projects/shared-meet-components/src/lib/typings/ce/room';
import { FeatureConfigurationService } from '../feature-configuration/feature-configuration.service';

@Injectable({
	providedIn: 'root'
})
export class RoomService {
	protected log;
	protected roomPreferences: MeetRoomPreferences | undefined;
	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService,
		protected featureConfService: FeatureConfigurationService
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

	async getRoomPreferences(roomId: string): Promise<MeetRoomPreferences> {
		this.log.d('Fetching room preferences for roomId:', roomId);
		try {
			const preferences = await this.httpService.getRoomPreferences(roomId);

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

	async loadPreferences(roomId: string, forceUpdate: boolean = false): Promise<MeetRoomPreferences> {
		if (this.roomPreferences && !forceUpdate) {
			this.log.d('Returning cached room preferences');
			return this.roomPreferences;
		}

		this.log.d('Fetching room preferences from server');
		try {
			this.roomPreferences = await this.getRoomPreferences(roomId);
			this.featureConfService.setRoomPreferences(this.roomPreferences);
			console.log('Room preferences loaded:', this.roomPreferences);
			return this.roomPreferences;
		} catch (error) {
			this.log.e('Error loading room preferences', error);
			throw new Error('Failed to load room preferences');
		}
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
