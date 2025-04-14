import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
	MeetRoom,
	MeetRoomOptions,
	MeetRoomRoleAndPermissions,
	MeetRoomPreferences,
	SecurityPreferencesDTO,
	TokenOptions,
	User
} from '@lib/typings/ce';
import { RecordingInfo } from 'openvidu-components-angular';
import { lastValueFrom } from 'rxjs';

@Injectable({
	providedIn: 'root'
})
export class HttpService {
	protected API_V1_VERSION = 'v1';
	protected API_PATH_PREFIX = `meet/api/${this.API_V1_VERSION}`;
	protected INTERNAL_API_PATH_PREFIX = `meet/internal-api/${this.API_V1_VERSION}`;

	constructor(protected http: HttpClient) {}

	createRoom(options: MeetRoomOptions): Promise<MeetRoom> {
		return this.postRequest(`${this.API_PATH_PREFIX}/rooms`, options);
	}

	deleteRoom(roomId: string): Promise<any> {
		return this.deleteRequest(`${this.API_PATH_PREFIX}/rooms/${roomId}`);
	}

	listRooms(fields?: string): Promise<MeetRoom[]> {
		let path = `${this.API_PATH_PREFIX}/rooms/`;
		if (fields) {
			path += `?fields=${encodeURIComponent(fields)}`;
		}
		return this.getRequest(path);
	}

	getRoom(roomId: string): Promise<MeetRoom> {
		let path = `${this.API_PATH_PREFIX}/rooms/${roomId}`;
		return this.getRequest(path);
	}

	getRoomRoleAndPermissions(roomId: string, secret: string): Promise<MeetRoomRoleAndPermissions> {
		return this.getRequest(`${this.INTERNAL_API_PATH_PREFIX}/rooms/${roomId}/roles/${secret}`);
	}

	generateParticipantToken(tokenOptions: TokenOptions): Promise<{ token: string }> {
		return this.postRequest(`${this.INTERNAL_API_PATH_PREFIX}/participants/token`, tokenOptions);
	}

	refreshParticipantToken(tokenOptions: TokenOptions): Promise<{ token: string }> {
		return this.postRequest(`${this.INTERNAL_API_PATH_PREFIX}/participants/token/refresh`, tokenOptions);
	}

	/**
	 * Retrieves security preferences.
	 *
	 * @returns {Promise<GlobalPreferences>} A promise that resolves to the global preferences.
	 */
	getSecurityPreferences(): Promise<SecurityPreferencesDTO> {
		return this.getRequest(`${this.INTERNAL_API_PATH_PREFIX}/preferences/security`);
	}

	/**
	 * TODO: Delete this method
	 * Retrieves the room preferences.
	 *
	 * @returns {Promise<MeetRoomPreferences>} A promise that resolves to the room preferences.
	 */
	getRoomPreferences(): Promise<MeetRoomPreferences> {
		return this.getRequest(`${this.API_PATH_PREFIX}/preferences/room`);
	}

	/**
	 * Saves the room preferences.
	 *
	 * @param preferences - The room preferences to be saved.
	 * @returns A promise that resolves when the preferences have been successfully saved.
	 */
	updateRoomPreferences(roomId: string, preferences: MeetRoomPreferences): Promise<any> {
		return this.putRequest(`${this.INTERNAL_API_PATH_PREFIX}/rooms/${roomId}`, preferences);
	}

	login(body: { username: string; password: string }): Promise<{ message: string }> {
		return this.postRequest(`${this.INTERNAL_API_PATH_PREFIX}/auth/login`, body);
	}

	logout(): Promise<{ message: string }> {
		return this.postRequest(`${this.INTERNAL_API_PATH_PREFIX}/auth/logout`);
	}

	refreshToken(): Promise<{ message: string }> {
		return this.postRequest(`${this.INTERNAL_API_PATH_PREFIX}/auth/refresh`);
	}

	getProfile(): Promise<User> {
		return this.getRequest(`${this.INTERNAL_API_PATH_PREFIX}/auth/profile`);
	}

	getRecordings(continuationToken?: string): Promise<{ recordings: RecordingInfo[]; continuationToken: string }> {
		let path = `${this.API_PATH_PREFIX}/recordings`;

		if (continuationToken) {
			path += `?continuationToken=${continuationToken}`;
		}

		return this.getRequest(path);
	}

	startRecording(roomId: string): Promise<RecordingInfo> {
		return this.postRequest(`${this.INTERNAL_API_PATH_PREFIX}/recordings`, { roomId });
	}

	stopRecording(recordingId: string): Promise<RecordingInfo> {
		return this.postRequest(`${this.INTERNAL_API_PATH_PREFIX}/recordings/${recordingId}/stop`);
	}

	deleteRecording(recordingId: string): Promise<RecordingInfo> {
		return this.deleteRequest(`${this.API_PATH_PREFIX}/recordings/${recordingId}`);
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
