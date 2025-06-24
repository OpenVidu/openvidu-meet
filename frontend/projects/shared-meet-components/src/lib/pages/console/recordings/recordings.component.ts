import { Component, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import {
	RecordingListsComponent,
	RecordingTableAction
} from '../../../components/recording-lists/recording-lists.component';
import { NotificationService, RecordingManagerService } from '../../../services';
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
		private recordingService: RecordingManagerService,
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
			case 'bulkDelete':
				await this.bulkDeleteRecordings(action.recordings);
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

			const response = await this.recordingService.listRecordings(recordingFilters);

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
		this.recordingService.playRecording(recording.recordingId);
	}

	private downloadRecording(recording: MeetRecordingInfo) {
		this.recordingService.downloadRecording(recording);
	}

	private copyLinkToClipboard(recording: MeetRecordingInfo) {
		// this.clipboard.copy('recordingLink');
		// this.notificationService.showSnackbar('Moderator link copied to clipboard');
	}

	private async deleteRecording(recording: MeetRecordingInfo) {
		const deleteCallback = async () => {
			try {
				await this.recordingService.deleteRecording(recording.recordingId);

				// Remove from local list
				const currentRecordings = this.recordings();
				this.recordings.set(currentRecordings.filter((r) => r.recordingId !== recording.recordingId));
				this.notificationService.showSnackbar('Recording deleted successfully');
			} catch (error) {
				console.error('Error deleting recording:', error);

				this.notificationService.showSnackbar('Failed to delete recording');
			}
		};

		this.notificationService.showDialog({
			confirmText: 'Delete',
			cancelText: 'Cancel',
			title: 'Delete Recording',
			message: `Are you sure you want to delete the recording <b>${recording.recordingId}</b>?`,
			confirmCallback: deleteCallback
		});
	}

	private async bulkDeleteRecordings(recordings: MeetRecordingInfo[]) {
		const bulkDeleteCallback = async () => {
			try {
				//TODO: Implement bulk delete logic in the backend
				// const recordingIds = recordings.map((r) => r.recordingId);
				// await this.recordingService.bulkDeleteRecordings(recordingIds);
				// // Remove from local list
				// const currentRecordings = this.recordings();
				// this.recordings.set(currentRecordings.filter((r) => !recordingIds.includes(r.recordingId)));
				// this.notificationService.showSnackbar('Recordings deleted successfully');
			} catch (error) {
				console.error('Error deleting recordings:', error);

				this.notificationService.showSnackbar('Failed to delete recordings');
			}
		};

		const count = recordings.length;
		this.notificationService.showDialog({
			confirmText: 'Delete all',
			cancelText: 'Cancel',
			title: 'Delete Recordings',
			message: `Are you sure you want to delete <b>${count}</b> recordings?`,
			confirmCallback: () => bulkDeleteCallback
		});
	}
}
