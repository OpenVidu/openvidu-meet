import { Component, OnInit, signal } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActionService, ILogger, LoggerService } from 'openvidu-components-angular';
import {
	RecordingListsComponent,
	RecordingTableAction
} from '../../../components/recording-lists/recording-lists.component';
import { ShareRecordingDialogComponent } from '../../../components/dialogs/share-recording-dialog/share-recording-dialog.component';
import { HttpService, NotificationService } from '../../../services';
import { MeetRecordingFilters, MeetRecordingInfo } from '../../../typings/ce';

@Component({
	selector: 'ov-recordings',
	standalone: true,
	imports: [
		RecordingListsComponent,
		MatButtonModule,
		MatIconModule,
		MatProgressSpinnerModule,
		MatSnackBarModule,
		MatTooltipModule
	],
	templateUrl: './recordings.component.html',
	styleUrl: './recordings.component.scss'
})
export class RecordingsComponent implements OnInit {
	recordings = signal<MeetRecordingInfo[]>([]);
	isLoading = false;
	showLoadingSpinner = false;
	canDeleteRecordings = true; // Set based on user permissions
	canDownloadRecordings = true; // Set based on user permissions
	hasMoreRecordings = false;

	// Pagination
	private nextPageToken?: string;
	protected log: ILogger;

	constructor(
		protected loggerService: LoggerService,
		private httpService: HttpService,
		private actionService: ActionService,
		private dialog: MatDialog,
		private clipboard: Clipboard,

		private notificationService: NotificationService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RecordingsComponent');
	}

	async ngOnInit() {
		await this.refreshRecordings();
	}

	async onRecordingAction(action: RecordingTableAction) {
		switch (action.action) {
			case 'play':
				this.playRecording(action.recordings[0]);
				break;
			case 'download':
				this.downloadRecording(action.recordings[0]);
				break;
			case 'copyLink':
				this.copyLinkToClipboard(action.recordings[0]);
				break;
			case 'delete':
				await this.deleteRecording(action.recordings[0]);
				break;
			case 'batchDelete':
				await this.batchDeleteRecordings(action.recordings);
				break;
			case 'batchDownload':
				// Implement batch download logic if needed
				break;
		}
	}

	async loadRecordings(filters?: { nameFilter: string; statusFilter: string }) {
		this.isLoading = true;
		const delaySpinner = setTimeout(() => {
			this.showLoadingSpinner = true;
		}, 200);

		try {
			const recordingFilters: MeetRecordingFilters = {
				maxItems: 50,
				nextPageToken: this.nextPageToken
			};

			// Apply room name filter if provided
			if (filters?.nameFilter) {
				recordingFilters.roomId = filters.nameFilter;
			}

			const response = await this.httpService.getRecordings(recordingFilters);

			// Filter by status on client side if needed
			let filteredRecordings = response.recordings;
			if (filters?.statusFilter) {
				filteredRecordings = response.recordings.filter((r) => r.status === filters.statusFilter);
			}

			// Update recordings list
			const currentRecordings = this.recordings();
			this.recordings.set([...currentRecordings, ...filteredRecordings]);

			// Update pagination
			this.nextPageToken = response.pagination.nextPageToken;
			this.hasMoreRecordings = response.pagination.isTruncated;
		} catch (error) {
			console.error('Error loading recordings:', error);
			this.notificationService.showAlert('Failed to load recordings');
			this.log.e('Error loading recordings:', error);
		} finally {
			this.isLoading = false;
			clearTimeout(delaySpinner);
			this.showLoadingSpinner = false;
		}
	}

	async loadMoreRecordings() {
		if (!this.hasMoreRecordings || this.isLoading) return;
		await this.loadRecordings();
	}

	async refreshRecordings() {
		this.recordings.set([]);
		this.nextPageToken = undefined;
		this.hasMoreRecordings = false;
		await this.loadRecordings();
	}

	private playRecording(recording: MeetRecordingInfo) {
		const recordingUrl = this.httpService.getRecordingMediaUrl(recording.recordingId);
		this.actionService.openRecordingPlayerDialog(recordingUrl);
	}

	private downloadRecording(recording: MeetRecordingInfo) {
		const recordingUrl = this.httpService.getRecordingMediaUrl(recording.recordingId);
		const link = document.createElement('a');
		link.href = recordingUrl;
		link.download = recording.filename || 'recording.mp4';
		link.click();
	}

	private copyLinkToClipboard(recording: MeetRecordingInfo) {
		// this.clipboard.copy('recordingLink');
		// this.notificationService.showSnackbar('Moderator link copied to clipboard');
	}

	private async deleteRecording(recording: MeetRecordingInfo) {
		if (!confirm(`Are you sure you want to delete the recording for room "${recording.roomId}"?`)) {
			return;
		}

		try {
			await this.httpService.deleteRecording(recording.recordingId);

			// Remove from local list
			const currentRecordings = this.recordings();
			this.recordings.set(currentRecordings.filter((r) => r.recordingId !== recording.recordingId));
			this.notificationService.showSnackbar('Recording deleted successfully');
		} catch (error) {
			console.error('Error deleting recording:', error);

			this.notificationService.showSnackbar('Failed to delete recording');
		}
	}

	private async batchDeleteRecordings(recordings: MeetRecordingInfo[]) {
		const count = recordings.length;
		if (!confirm(`Are you sure you want to delete ${count} recording(s)?`)) {
			return;
		}

		let successCount = 0;
		let failureCount = 0;

		for (const recording of recordings) {
			try {
				await this.httpService.deleteRecording(recording.recordingId);
				successCount++;
			} catch (error) {
				console.error('Error deleting recording:', recording.recordingId, error);
				failureCount++;
			}
		}

		// Remove successfully deleted recordings from local list
		if (successCount > 0) {
			const deletedIds = new Set(recordings.map((r) => r.recordingId));
			const currentRecordings = this.recordings();
			this.recordings.set(currentRecordings.filter((r) => !deletedIds.has(r.recordingId)));
		}

		// Show result message
		if (failureCount === 0) {
			this.notificationService.showSnackbar(`${successCount} recording(s) deleted successfully`);
		} else {
			this.notificationService.showSnackbar(`${successCount} recording(s) deleted, ${failureCount} failed`);
		}
	}
}
