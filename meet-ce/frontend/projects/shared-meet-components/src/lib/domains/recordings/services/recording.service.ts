import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MeetRecordingFilters, MeetRecordingInfo } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { TokenStorageService } from '../../../shared/services/token-storage.service';
import { LoggerService } from '../../meeting/openvidu-components';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RecordingShareDialogComponent } from '../components/recording-share-dialog/recording-share-dialog.component';

@Injectable({
	providedIn: 'root'
})
export class RecordingService {
	private httpService = inject(HttpService);
	private navigationService = inject(NavigationService);
	private runtimeConfigService = inject(RuntimeConfigService);
	protected tokenStorageService = inject(TokenStorageService);
	protected roomMemberContextService = inject(RoomMemberContextService);
	protected meetingContextService = inject(MeetingContextService);
	protected dialog = inject(MatDialog);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - RecordingManagerService');

	protected readonly RECORDINGS_API = `${HttpService.API_PATH_PREFIX}/recordings`;

	/**
	 * Starts recording for a room
	 *
	 * @param roomId - The ID of the room to start recording
	 * @return A promise that resolves to the recording information
	 */
	async startRecording(roomId: string): Promise<MeetRecordingInfo> {
		try {
			return this.httpService.postRequest(this.RECORDINGS_API, { roomId });
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
			const path = `${this.RECORDINGS_API}/${recordingId}/stop`;
			return this.httpService.postRequest(path, {});
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
	 * Gets a specific recording by ID
	 *
	 * @param recordingId - The ID of the recording to retrieve
	 * @param recordingSecret - Optional recording secret for accessing the recording
	 * @param headers - Optional additional headers to include in the request
	 * @return A promise that resolves to the recording information
	 */
	async getRecording(
		recordingId: string,
		recordingSecret?: string,
		headers?: Record<string, string>
	): Promise<MeetRecordingInfo> {
		let path = `${this.RECORDINGS_API}/${recordingId}`;
		if (recordingSecret) {
			path += `?recordingSecret=${recordingSecret}`;
		}

		return this.httpService.getRequest(path, headers);
	}

	/**
	 * Gets the media URL for a recording
	 *
	 * @param recordingId - The ID of the recording
	 * @param recordingSecret - Optional recording secret for accessing recording media
	 * @return The URL to access the recording media
	 */
	getRecordingMediaUrl(recordingId: string, recordingSecret?: string): string {
		const params = new URLSearchParams();

		// If recordingSecret is provided, use it (public/private access mode)
		if (recordingSecret) {
			params.append('recordingSecret', recordingSecret);
		}

		// Also use access and/or room member token if available
		const accessToken = this.tokenStorageService.getAccessToken();
		if (accessToken) {
			params.append('accessToken', accessToken);
		}

		const roomMemberToken = this.roomMemberContextService.roomMemberToken();
		if (roomMemberToken) {
			params.append('roomMemberToken', roomMemberToken);
		}

		const now = Date.now();
		params.append('t', now.toString());
		return this.runtimeConfigService.resolveUrl(`${this.RECORDINGS_API}/${recordingId}/media?${params.toString()}`);
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
		failed: { recordingId: string; error: string; message: string }[];
	}> {
		if (recordingIds.length === 0) {
			throw new Error('No recording IDs provided for bulk deletion');
		}

		const path = `${this.RECORDINGS_API}?recordingIds=${recordingIds.join(',')}`;
		return this.httpService.deleteRequest(path);
	}

	/**
	 * Plays a recording by opening the recording route in a new tab
	 *
	 * @param recordingId - The ID of the recording to play
	 */
	async playRecording(recordingId: string) {
		this.navigationService.openInNewTab(`/recording/${recordingId}`, this.meetingContextService.roomSecret());
	}

	/**
	 * Downloads a recording by creating a link and triggering a click event
	 *
	 * @param recording - The recording information containing the ID and filename
	 * @param recordingSecret - Optional recording secret for accessing the recording
	 */
	downloadRecording(recording: MeetRecordingInfo, recordingSecret?: string): void {
		const recordingUrl = this.getRecordingMediaUrl(recording.recordingId, recordingSecret);
		const filename = recording.filename || `${recording.recordingId}.mp4`;

		void this.triggerDownload(recordingUrl, filename).catch((error) => {
			this.log.e('Error downloading recording:', error);
		});
	}

	/**
	 * Triggers a browser download for the given URL.
	 *
	 * The `<a download>` attribute is honored only for same-origin URLs. When the
	 * element is embedded as a webcomponent the recording media lives on the
	 * (cross-origin) Meet server and the `/media` endpoint streams it inline, so the
	 * browser would ignore `download` and navigate to the video instead. In that
	 * case fetch the file and download it through a same-origin object URL.
	 */
	private async triggerDownload(url: string, filename: string): Promise<void> {
		if (!this.isCrossOriginUrl(url)) {
			this.clickDownloadLink(url, filename);
			return;
		}

		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Download request failed with status ${response.status}`);
		}

		const objectUrl = URL.createObjectURL(await response.blob());
		this.clickDownloadLink(objectUrl, filename);

		// Defer revocation so the browser has captured the blob for the download.
		// FIXME: This may lead to increased memory usage if the user triggers many downloads in a short period of time.
		setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
	}

	private clickDownloadLink(href: string, filename: string): void {
		const link = document.createElement('a');
		link.href = href;
		link.download = filename;
		link.click();
	}

	private isCrossOriginUrl(url: string): boolean {
		try {
			return new URL(url, window.location.href).origin !== window.location.origin;
		} catch {
			return false;
		}
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

		// Try to add access and/or room member token if available
		const accessToken = this.tokenStorageService.getAccessToken();
		if (accessToken) {
			params.append('accessToken', accessToken);
		}

		const roomMemberToken = this.roomMemberContextService.roomMemberToken();
		if (roomMemberToken) {
			params.append('roomMemberToken', roomMemberToken);
		}

		// Resolve against the Meet server URL for webcomponent embedding (no-op in the SPA).
		const downloadUrl = this.runtimeConfigService.resolveUrl(
			`${this.RECORDINGS_API}/download?${params.toString()}`
		);
		const link = document.createElement('a');
		link.href = downloadUrl;
		link.download = 'recordings.zip';
		link.click();
	}

	/**
	 * Opens a dialog to share a recording
	 *
	 * @param recordingId - The ID of the recording to share
	 * @param hasRecordingAccess - Optional flag indicating the current user is known to have access to this recording
	 */
	openShareRecordingDialog(recordingId: string, hasRecordingAccess = false) {
		this.dialog.open(RecordingShareDialogComponent, {
			width: '450px',
			data: {
				recordingId,
				hasRecordingAccess
			},
			panelClass: 'ov-meet-dialog'
		});
	}
}
