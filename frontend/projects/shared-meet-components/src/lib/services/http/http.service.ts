import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MeetRoom, MeetRoomOptions } from 'projects/shared-meet-components/src/lib/typings/ce/room';
import {
	GlobalPreferences,
	ParticipantRole,
	RoomPreferences,
	SecurityPreferencesDTO,
	TokenOptions,
	User
} from '@lib/typings/ce';
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

	createRoom(options: MeetRoomOptions): Promise<MeetRoom> {
		return this.postRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/rooms`, options);
	}

	deleteRoom(roomName: string): Promise<any> {
		return this.deleteRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/rooms/${roomName}`);
	}

	listRooms(fields?: string): Promise<MeetRoom[]> {
		let path = `${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/rooms/`;
		if (fields) {
			path += `?fields=${encodeURIComponent(fields)}`;
		}
		return this.getRequest(path);
	}

	getRoom(roomName: string, fields?: string): Promise<MeetRoom> {
		let path = `${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/rooms/${roomName}`;
		if (fields) {
			path += `?fields=${encodeURIComponent(fields)}`;
		}
		return this.getRequest(path);
	}

	getParticipantRole(roomName: string, secret: string): Promise<ParticipantRole> {
		return this.getRequest(
			`${this.INTERNAL_API_PATH_PREFIX}/${this.API_V1_VERSION}/rooms/${roomName}/participant-role?secret=${secret}`
		);
	}

	generateParticipantToken(tokenOptions: TokenOptions): Promise<{ token: string }> {
		return this.postRequest(
			`${this.INTERNAL_API_PATH_PREFIX}/${this.API_V1_VERSION}/participants/token`,
			tokenOptions
		);
	}

	refreshParticipantToken(tokenOptions: TokenOptions): Promise<{ token: string }> {
		return this.postRequest(
			`${this.INTERNAL_API_PATH_PREFIX}/${this.API_V1_VERSION}/participants/token/refresh`,
			tokenOptions
		);
	}

	/**
	 * Retrieves security preferences.
	 *
	 * @returns {Promise<GlobalPreferences>} A promise that resolves to the global preferences.
	 */
	getSecurityPreferences(): Promise<SecurityPreferencesDTO> {
		return this.getRequest(`${this.API_PATH_PREFIX}/${this.API_V1_VERSION}/preferences/security`);
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
