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
	protected pathPrefix = 'meet/api';
	protected apiVersion = 'v1';

	constructor(protected http: HttpClient) {}

	createRoom(options: OpenViduMeetRoomOptions): Promise<OpenViduMeetRoom> {
		return this.postRequest(`${this.pathPrefix}/${this.apiVersion}/rooms`, options);
	}

	deleteRoom(roomName: string): Promise<any> {
		return this.deleteRequest(`${this.pathPrefix}/${this.apiVersion}/rooms/${roomName}`);
	}

	listRooms(fields?: string): Promise<OpenViduMeetRoom[]> {
		let path = `${this.pathPrefix}/${this.apiVersion}/rooms/`;
		if (fields) {
			path += `?fields=${encodeURIComponent(fields)}`;
		}
		return this.getRequest(path);
	}

	getRoom(roomName: string, fields?: string): Promise<OpenViduMeetRoom> {
		let path = `${this.pathPrefix}/${this.apiVersion}/rooms/${roomName}`;
		if (fields) {
			path += `?fields=${encodeURIComponent(fields)}`;
		}
		return this.getRequest(path);
	}

	generateParticipantToken(tokenOptions: TokenOptions): Promise<{ token: string }> {
		return this.postRequest(`${this.pathPrefix}/participants/token`, tokenOptions);
	}

	refreshParticipantToken(tokenOptions: TokenOptions): Promise<{ token: string }> {
		return this.postRequest(`${this.pathPrefix}/participants/token/refresh`, tokenOptions);
	}

	/**
	 * Retrieves the global preferences.
	 *
	 * @returns {Promise<GlobalPreferences>} A promise that resolves to the global preferences.
	 */
	getGlobalPreferences(): Promise<GlobalPreferences> {
		return this.getRequest(`${this.pathPrefix}/${this.apiVersion}/preferences`);
	}

	/**
	 * Retrieves the room preferences.
	 *
	 * @returns {Promise<RoomPreferences>} A promise that resolves to the room preferences.
	 */
	getRoomPreferences(): Promise<RoomPreferences> {
		return this.getRequest(`${this.pathPrefix}/${this.apiVersion}/preferences/room`);
	}

	/**
	 * Saves the room preferences.
	 *
	 * @param preferences - The room preferences to be saved.
	 * @returns A promise that resolves when the preferences have been successfully saved.
	 */
	saveRoomPreferences(preferences: RoomPreferences): Promise<any> {
		return this.putRequest(`${this.pathPrefix}/preferences/room`, preferences);
	}

	login(body: { username: string; password: string }): Promise<{ message: string }> {
		return this.postRequest(`${this.pathPrefix}/${this.apiVersion}/auth/login`, body);
	}

	logout(): Promise<{ message: string }> {
		return this.postRequest(`${this.pathPrefix}/${this.apiVersion}/auth/logout`);
	}

	refreshToken(): Promise<{ message: string }> {
		return this.postRequest(`${this.pathPrefix}/${this.apiVersion}/auth/refresh`);
	}

	getProfile(): Promise<User> {
		return this.getRequest(`${this.pathPrefix}/${this.apiVersion}/auth/profile`);
	}

	getRecordings(continuationToken?: string): Promise<{ recordings: RecordingInfo[]; continuationToken: string }> {
		let path = `${this.pathPrefix}/${this.apiVersion}/recordings`;

		if (continuationToken) {
			path += `?continuationToken=${continuationToken}`;
		}

		return this.getRequest(path);
	}

	startRecording(roomName: string): Promise<RecordingInfo> {
		return this.postRequest(`${this.pathPrefix}/${this.apiVersion}/recordings`, { roomName });
	}

	stopRecording(recordingId: string): Promise<RecordingInfo> {
		return this.putRequest(`${this.pathPrefix}/${this.apiVersion}/recordings/${recordingId}`);
	}

	deleteRecording(recordingId: string): Promise<RecordingInfo> {
		return this.deleteRequest(`${this.pathPrefix}/${this.apiVersion}/recordings/${recordingId}`);
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
