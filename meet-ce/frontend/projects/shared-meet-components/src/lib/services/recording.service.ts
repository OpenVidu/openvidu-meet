import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ShareRecordingDialogComponent } from '@openvidu-meet/shared/components';
import {
	AuthService,
	FeatureConfigurationService,
	GlobalConfigService,
	HttpService,
	TokenStorageService,
	ParticipantService
} from '@openvidu-meet/shared/services';
import { AuthTransportMode, MeetRecordingFilters, MeetRecordingInfo, RecordingPermissions } from '@openvidu-meet/typings';
import { getValidDecodedToken } from '@openvidu-meet/shared/utils';
import { LoggerService } from 'openvidu-components-angular';

@Injectable({
	providedIn: 'root'
})
export class RecordingService {
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
		protected participantService: ParticipantService,
		protected authService: AuthService,
		protected featureConfService: FeatureConfigurationService,
		protected globalConfigService: GlobalConfigService,
		protected tokenStorageService: TokenStorageService,
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

		// If secret is provided, use it (public/private access mode)
		if (secret) {
			params.append('secret', secret);
		} else {
			// Otherwise, try to use access and/or recording token from sessionStorage (header mode)
			const accessToken = this.tokenStorageService.getAccessToken();
			if (accessToken) {
				params.append('accessToken', accessToken);
			}

			const recordingToken = this.tokenStorageService.getRecordingToken();
			if (recordingToken) {
				params.append('recordingToken', recordingToken);
			}
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

		try {
			const { token } = await this.httpService.postRequest<{ token: string }>(path, { secret });

			// Store token in sessionStorage for header mode
			const authTransportMode = await this.globalConfigService.getAuthTransportMode();
			if (authTransportMode === AuthTransportMode.HEADER) {
				this.tokenStorageService.setRecordingToken(token);
			}

			this.setRecordingPermissionsFromToken(token);
			return this.recordingPermissions;
		} catch (error) {
			this.featureConfService.setRecordingPermissions({
				canRetrieveRecordings: false,
				canDeleteRecordings: false
			});
			throw error;
		}
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

			// Update feature configuration
			this.featureConfService.setRecordingPermissions(this.recordingPermissions);
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
	async bulkDeleteRecordings(recordingIds: string[]): Promise<{
		message: string;
		deleted: string[];
	}> {
		if (recordingIds.length === 0) {
			throw new Error('No recording IDs provided for bulk deletion');
		}

		const path = `${this.RECORDINGS_API}?recordingIds=${recordingIds.join(',')}`;
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Plays a recording by generating a URL and opening it in a new tab
	 *
	 * @param recordingId - The ID of the recording to play
	 */
	async playRecording(recordingId: string) {
		// const privateAccess = await this.authService.isUserAuthenticated();
		const { url } = await this.generateRecordingUrl(recordingId, false);
		window.open(url, '_blank');
	}

	/**
	 * Downloads a recording by creating a link and triggering a click event
	 *
	 * @param recording - The recording information containing the ID and filename
	 * @param secret - Optional secret for accessing the recording
	 */
	downloadRecording(recording: MeetRecordingInfo, secret?: string) {
		const recordingUrl = this.getRecordingMediaUrl(recording.recordingId, secret);
		const link = document.createElement('a');
		link.href = recordingUrl;
		link.download = recording.filename || `${recording.recordingId}.mp4`;
		link.click();
	}

	/**
	 * Downloads multiple recordings as a ZIP file
	 *
	 * @param recordingIds - An array of recording IDs to download
	 */
	downloadRecordingsAsZip(recordingIds: string[]) {
		if (recordingIds.length === 0) {
			throw new Error('No recordings IDs provided for download');
		}

		const params = new URLSearchParams();
		params.append('recordingIds', recordingIds.join(','));

		// Try to add access and/or recording token from sessionStorage (header mode)
		const accessToken = this.tokenStorageService.getAccessToken();
		if (accessToken) {
			params.append('accessToken', accessToken);
		}

		const recordingToken = this.tokenStorageService.getRecordingToken();
		if (recordingToken) {
			params.append('recordingToken', recordingToken);
		}

		const downloadUrl = `${this.RECORDINGS_API}/download?${params.toString()}`;
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
