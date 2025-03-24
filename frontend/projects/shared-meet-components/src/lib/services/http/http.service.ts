import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { OpenViduMeetRoom, OpenViduMeetRoomOptions } from 'projects/shared-meet-components/src/lib/typings/ce/room';
import { GlobalPreferences, RoomPreferences, TokenOptions, User } from '@lib/typings/ce';
import { RecordingInfo, Room } from 'openvidu-components-angular';
import { lastValueFrom } from 'rxjs';

@Injectable({
	providedIn: 'root'
})
export class HttpService {
	// private baseHref: string;
	protected API_PATH_PREFIX = 'meet/api';
	protected INTERNAL_API_PATH_PREFIX = 'meet/internal-api';
	protected API_V1_VERSION = 'v1';

	constructor(protected http: HttpClient) {}

	createRoom(options: OpenViduMeetRoomOptions): Promise<OpenViduMeetRoom> {
		return this.postRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/rooms`, options);
	}

	deleteRoom(roomName: string): Promise<any> {
		return this.deleteRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/rooms/${roomName}`);
	}

	listRooms(fields?: string): Promise<OpenViduMeetRoom[]> {
		let path = `${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/rooms/`;
		if (fields) {
			path += `?fields=${encodeURIComponent(fields)}`;
		}
		return this.getRequest(path);
	}

	getRoom(roomName: string, fields?: string): Promise<OpenViduMeetRoom> {
		let path = `${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/rooms/${roomName}`;
		if (fields) {
			path += `?fields=${encodeURIComponent(fields)}`;
		}
		return this.getRequest(path);
	}

	generateParticipantToken(tokenOptions: TokenOptions): Promise<{ token: string }> {
		return this.postRequest(`${this.INTERNAL_API_PATH_PREFIX}/${this.API_V1_VERSION}/participants/token`, tokenOptions);
	}

	refreshParticipantToken(tokenOptions: TokenOptions): Promise<{ token: string }> {
		return this.postRequest(`${this.INTERNAL_API_PATH_PREFIX}/${this.API_V1_VERSION}/participants/token/refresh`, tokenOptions);
	}

	/**
	 * Retrieves the global preferences.
	 *
	 * @returns {Promise<GlobalPreferences>} A promise that resolves to the global preferences.
	 */
	getGlobalPreferences(): Promise<GlobalPreferences> {
		return this.getRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/preferences`);
	}

	/**
	 * Retrieves the room preferences.
	 *
	 * @returns {Promise<RoomPreferences>} A promise that resolves to the room preferences.
	 */
	getRoomPreferences(): Promise<RoomPreferences> {
		return this.getRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/preferences/room`);
	}

	/**
	 * Saves the room preferences.
	 *
	 * @param preferences - The room preferences to be saved.
	 * @returns A promise that resolves when the preferences have been successfully saved.
	 */
	saveRoomPreferences(preferences: RoomPreferences): Promise<any> {
		return this.putRequest(`${this.API_PATH_PREFIX}/preferences/room`, preferences);
	}

	login(body: { username: string; password: string }): Promise<{ message: string }> {
		return this.postRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/auth/login`, body);
	}

	logout(): Promise<{ message: string }> {
		return this.postRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/auth/logout`);
	}

	refreshToken(): Promise<{ message: string }> {
		return this.postRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/auth/refresh`);
	}

	getProfile(): Promise<User> {
		return this.getRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/auth/profile`);
	}

	getRecordings(continuationToken?: string): Promise<{ recordings: RecordingInfo[]; continuationToken: string }> {
		let path = `${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/recordings`;

		if (continuationToken) {
			path += `?continuationToken=${continuationToken}`;
		}

		return this.getRequest(path);
	}

	startRecording(roomId: string): Promise<RecordingInfo> {
		return this.postRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/recordings`, { roomId });
	}

	stopRecording(recordingId: string): Promise<RecordingInfo> {
		return this.putRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/recordings/${recordingId}`);
	}

	deleteRecording(recordingId: string): Promise<RecordingInfo> {
		return this.deleteRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/recordings/${recordingId}`);
	}

	protected getRequest<T>(path: string): Promise<T> {
		return lastValueFrom(this.http.get<T>(path));
	}

	protected postRequest<T>(path: string, body: any = {}): Promise<T> {
		return lastValueFrom(this.http.post<T>(path, body));
	}

	protected putRequest<T>(path: string, body: any = {}): Promise<T> {
		return lastValueFrom(this.http.put<T>(path, body));
	}

	protected deleteRequest<T>(path: string): Promise<T> {
		return lastValueFrom(this.http.delete<T>(path));
	}
}
