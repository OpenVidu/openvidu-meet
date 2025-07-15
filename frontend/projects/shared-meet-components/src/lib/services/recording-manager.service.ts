import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ShareRecordingDialogComponent } from '@lib/components';
import { HttpService, ParticipantTokenService } from '@lib/services';
import { MeetRecordingFilters, MeetRecordingInfo, RecordingPermissions } from '@lib/typings/ce';
import { getValidDecodedToken } from '@lib/utils';
import { ActionService, LoggerService } from 'openvidu-components-angular';

@Injectable({
	providedIn: 'root'
})
export class RecordingManagerService {
	protected readonly RECORDINGS_API = `${HttpService.API_PATH_PREFIX}/recordings`;
	protected readonly INTERNAL_RECORDINGS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/recordings`;

	protected recordingPermissions: RecordingPermissions = {
		canRetrieveRecordings: false,
		canDeleteRecordings: false
	};

	protected log;

	constructor(
		protected loggerService: LoggerService,
		private httpService: HttpService,
		protected participantService: ParticipantTokenService,
		private actionService: ActionService,
		protected dialog: MatDialog
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RecordingManagerService');
	}

	/**
	 * Starts recording for a room
	 *
	 * @param roomId - The ID of the room to start recording
	 * @return A promise that resolves to the recording information
	 */
	async startRecording(roomId: string): Promise<MeetRecordingInfo> {
		try {
			const headers = this.participantService.getParticipantRoleHeader();
			return this.httpService.postRequest(this.INTERNAL_RECORDINGS_API, { roomId }, headers);
		} catch (error) {
			console.error('Error starting recording:', error);
			throw error;
		}
	}

	/**
	 * Stops recording by recording ID
	 *
	 * @param recordingId - The ID of the recording to stop
	 * @return A promise that resolves to the updated recording information
	 */
	async stopRecording(recordingId?: string): Promise<MeetRecordingInfo> {
		if (!recordingId) {
			throw new Error('Recording ID not found when stopping recording');
		}

		try {
			const path = `${this.INTERNAL_RECORDINGS_API}/${recordingId}/stop`;
			const headers = this.participantService.getParticipantRoleHeader();
			return this.httpService.postRequest(path, {}, headers);
		} catch (error) {
			console.error('Error stopping recording:', error);
			throw error;
		}
	}

	/**
	 * Lists recordings with optional filters for pagination and room ID
	 *
	 * @param filters - Optional filters for pagination and room ID
	 * @return A promise that resolves to an object containing recordings and pagination info
	 */
	async listRecordings(filters?: MeetRecordingFilters): Promise<{
		recordings: MeetRecordingInfo[];
		pagination: {
			isTruncated: boolean;
			nextPageToken?: string;
			maxItems: number;
		};
	}> {
		let path = this.RECORDINGS_API;

		if (filters) {
			const params = new URLSearchParams();
			if (filters.maxItems) {
				params.append('maxItems', filters.maxItems.toString());
			}
			if (filters.nextPageToken) {
				params.append('nextPageToken', filters.nextPageToken);
			}
			if (filters.roomId) {
				params.append('roomId', filters.roomId);
			}
			if (filters.fields) {
				params.append('fields', filters.fields);
			}

			path += `?${params.toString()}`;
		}

		return this.httpService.getRequest(path);
	}

	/**
	 * Gets a specific recording by ID
	 *
	 * @param recordingId - The ID of the recording to retrieve
	 * @param secret - Optional secret for accesing the recording
	 * @return A promise that resolves to the recording information
	 */
	async getRecording(recordingId: string, secret?: string): Promise<MeetRecordingInfo> {
		let path = `${this.RECORDINGS_API}/${recordingId}`;
		if (secret) {
			path += `?secret=${secret}`;
		}

		return this.httpService.getRequest(path);
	}

	/**
	 * Gets the media URL for a recording
	 *
	 * @param recordingId - The ID of the recording
	 * @param secret - Optional secret for accessing the recording media
	 * @return The URL to access the recording media
	 */
	getRecordingMediaUrl(recordingId: string, secret?: string): string {
		const params = new URLSearchParams();
		if (secret) {
			params.append('secret', secret);
		}

		const now = Date.now();
		params.append('t', now.toString());
		return `${this.RECORDINGS_API}/${recordingId}/media?${params.toString()}`;
	}

	/**
	 * Generates a URL for accessing a recording
	 *
	 * @param recordingId - The ID of the recording
	 * @param privateAccess - Whether the access is private
	 * @return A promise that resolves to an object containing the URL
	 */
	async generateRecordingUrl(recordingId: string, privateAccess: boolean): Promise<{ url: string }> {
		const path = `${this.RECORDINGS_API}/${recordingId}/url?privateAccess=${privateAccess}`;
		return this.httpService.getRequest(path);
	}

	/**
	 * Generates a token for accessing recordings in a room
	 *
	 * @param roomId - The ID of the room for which the token is generated
	 * @param secret - The secret for the room
	 * @return A promise that resolves to an object containing the recording permissions
	 */
	async generateRecordingToken(roomId: string, secret: string): Promise<RecordingPermissions> {
		const path = `${HttpService.INTERNAL_API_PATH_PREFIX}/rooms/${roomId}/recording-token`;
		const { token } = await this.httpService.postRequest<{ token: string }>(path, { secret });

		this.setRecordingPermissionsFromToken(token);
		return this.recordingPermissions;
	}

	/**
	 * Sets recording permissions from a token
	 *
	 * @param token - The JWT token containing recording permissions
	 */
	protected setRecordingPermissionsFromToken(token: string) {
		try {
			const decodedToken = getValidDecodedToken(token);
			this.recordingPermissions = decodedToken.metadata.recordingPermissions;
		} catch (error) {
			this.log.e('Error setting recording permissions from token', error);
			throw new Error('Error setting recording permissions from token');
		}
	}

	canRetrieveRecordings(): boolean {
		return this.recordingPermissions.canRetrieveRecordings;
	}

	canDeleteRecordings(): boolean {
		return this.recordingPermissions.canDeleteRecordings;
	}

	/**
	 * Deletes a recording by ID
	 *
	 * @param recordingId - The ID of the recording to delete
	 * @return A promise that resolves to the deletion response
	 */
	async deleteRecording(recordingId: string): Promise<any> {
		const path = `${this.RECORDINGS_API}/${recordingId}`;
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Bulk deletes recordings by their IDs
	 *
	 * @param recordingIds - An array of recording IDs to delete
	 * @return A promise that resolves to the deletion response
	 */
	async bulkDeleteRecordings(recordingIds: string[]): Promise<any> {
		if (recordingIds.length === 0) {
			throw new Error('No recording IDs provided for bulk deletion');
		}

		const path = `${this.RECORDINGS_API}?recordingIds=${recordingIds.join(',')}`;
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Plays a recording by opening a dialog with the recording player
	 *
	 * @param recordingId - The ID of the recording to play
	 * @param secret - Optional secret for accessing the recording
	 */
	playRecording(recordingId: string, secret?: string) {
		const recordingUrl = this.getRecordingMediaUrl(recordingId, secret);
		this.actionService.openRecordingPlayerDialog(recordingUrl);
	}

	/**
	 * Downloads a recording by creating a link and triggering a click event
	 *
	 * @param recording - The recording information containing the ID and filename
	 */
	downloadRecording(recording: MeetRecordingInfo) {
		const recordingUrl = this.getRecordingMediaUrl(recording.recordingId);
		const link = document.createElement('a');
		link.href = recordingUrl;
		link.download = recording.filename || `${recording.recordingId}.mp4`;
		link.click();
	}

	/**
	 * Downloads multiple recordings as a ZIP file
	 *
	 * @param recordings - An array of recording IDs to download
	 */
	downloadRecordingsAsZip(recordingIds: string[]) {
		if (recordingIds.length === 0) {
			throw new Error('No recordings IDs provided for download');
		}

		const downloadUrl = `${this.RECORDINGS_API}/download?recordingIds=${recordingIds.join(',')}`;
		const link = document.createElement('a');
		link.href = downloadUrl;
		link.download = 'recordings.zip';
		link.click();
	}

	/**
	 * Opens a dialog to share a recording
	 *
	 * @param recordingId - The ID of the recording to share
	 * @param recordingUrl - Optional URL of the recording to share
	 */
	openShareRecordingDialog(recordingId: string, recordingUrl?: string) {
		this.dialog.open(ShareRecordingDialogComponent, {
			width: '450px',
			data: {
				recordingId,
				recordingUrl
			},
			panelClass: 'ov-meet-dialog'
		});
	}
}
