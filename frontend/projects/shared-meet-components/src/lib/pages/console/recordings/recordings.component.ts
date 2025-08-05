import { Component, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { RecordingListsComponent, RecordingTableAction } from '@lib/components';
import { NotificationService, RecordingManagerService } from '@lib/services';
import { MeetRecordingFilters, MeetRecordingInfo } from '@lib/typings/ce';
import { ILogger, LoggerService } from 'openvidu-components-angular';

@Component({
	selector: 'ov-recordings',
	standalone: true,
	imports: [RecordingListsComponent, MatIconModule, MatProgressSpinnerModule],
	templateUrl: './recordings.component.html',
	styleUrl: './recordings.component.scss'
})
export class RecordingsComponent implements OnInit {
	recordings = signal<MeetRecordingInfo[]>([]);
	isLoading = false;
	showLoadingSpinner = false;

	// Pagination
	hasMoreRecordings = false;
	private nextPageToken?: string;

	protected log: ILogger;

	constructor(
		protected loggerService: LoggerService,
		private recordingService: RecordingManagerService,
		private notificationService: NotificationService,
		protected route: ActivatedRoute
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RecordingsComponent');
	}

	async ngOnInit() {
		const roomId = this.route.snapshot.queryParamMap.get('room-id');
		if (roomId) {
			// If a specific room ID is provided, filter recordings by that room
			await this.loadRecordings({ nameFilter: roomId, statusFilter: '' });
		} else {
			// Load all recordings if no room ID is specified
			await this.loadRecordings();
		}
	}

	async onRecordingAction(action: RecordingTableAction) {
		switch (action.action) {
			case 'play':
				this.playRecording(action.recordings[0]);
				break;
			case 'download':
				this.downloadRecording(action.recordings[0]);
				break;
			case 'shareLink':
				this.shareRecordingLink(action.recordings[0]);
				break;
			case 'delete':
				this.deleteRecording(action.recordings[0]);
				break;
			case 'bulkDelete':
				this.bulkDeleteRecordings(action.recordings);
				break;
			case 'bulkDownload':
				this.bulkDownloadRecordings(action.recordings);
				break;
		}
	}

	private async loadRecordings(filters?: { nameFilter: string; statusFilter: string }) {
		this.isLoading = true;
		const delaySpinner = setTimeout(() => {
			this.showLoadingSpinner = true;
		}, 200);

		try {
			const recordingFilters: MeetRecordingFilters = {
				maxItems: 50,
				nextPageToken: this.nextPageToken
			};

			// Apply room ID filter if provided
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
			this.notificationService.showAlert('Failed to load recordings');
			this.log.e('Error loading recordings:', error);
		} finally {
			this.isLoading = false;
			clearTimeout(delaySpinner);
			this.showLoadingSpinner = false;
		}
	}

	async loadMoreRecordings(filters?: { nameFilter: string; statusFilter: string }) {
		if (!this.hasMoreRecordings || this.isLoading) return;
		await this.loadRecordings(filters);
	}

	async refreshRecordings(filters?: { nameFilter: string; statusFilter: string }) {
		this.recordings.set([]);
		this.nextPageToken = undefined;
		this.hasMoreRecordings = false;
		await this.loadRecordings(filters);
	}

	private async playRecording(recording: MeetRecordingInfo) {
		await this.recordingService.playRecording(recording.recordingId);
	}

	private downloadRecording(recording: MeetRecordingInfo) {
		this.recordingService.downloadRecording(recording);
	}

	private shareRecordingLink(recording: MeetRecordingInfo) {
		this.recordingService.openShareRecordingDialog(recording.recordingId);
	}

	private deleteRecording(recording: MeetRecordingInfo) {
		const deleteCallback = async () => {
			try {
				await this.recordingService.deleteRecording(recording.recordingId);

				// Remove from local list
				const currentRecordings = this.recordings();
				this.recordings.set(currentRecordings.filter((r) => r.recordingId !== recording.recordingId));
				this.notificationService.showSnackbar('Recording deleted successfully');
			} catch (error) {
				this.log.e('Error deleting recording:', error);
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

	private bulkDeleteRecordings(recordings: MeetRecordingInfo[]) {
		const bulkDeleteCallback = async () => {
			try {
				const recordingIds = recordings.map((r) => r.recordingId);
				const response = await this.recordingService.bulkDeleteRecordings(recordingIds);

				const currentRecordings = this.recordings();

				switch (response.statusCode) {
					case 204:
						// All recordings deleted successfully
						this.recordings.set(currentRecordings.filter((r) => !recordingIds.includes(r.recordingId)));
						this.notificationService.showSnackbar('All recordings deleted successfully');
						break;
					case 200:
						// Some recordings were deleted, some not
						const { deleted = [], notDeleted = [] } = response;

						// Remove deleted recordings from the list
						this.recordings.set(currentRecordings.filter((r) => !deleted.includes(r.recordingId)));

						let msg = '';
						if (deleted.length > 0) {
							msg += `${deleted.length} recording(s) deleted successfully. `;
						}
						if (notDeleted.length > 0) {
							msg += `${notDeleted.length} recording(s) could not be deleted.`;
						}

						this.notificationService.showSnackbar(msg.trim());
						this.log.w('Some recordings could not be deleted:', notDeleted);
						break;
				}
			} catch (error) {
				this.log.e('Error deleting recordings:', error);
				this.notificationService.showSnackbar('Failed to delete recordings');
			}
		};

		const count = recordings.length;
		this.notificationService.showDialog({
			confirmText: 'Delete all',
			cancelText: 'Cancel',
			title: 'Delete Recordings',
			message: `Are you sure you want to delete <b>${count}</b> recordings?`,
			confirmCallback: bulkDeleteCallback
		});
	}

	private bulkDownloadRecordings(recordings: MeetRecordingInfo[]) {
		const recordingIds = recordings.map((r) => r.recordingId);
		this.recordingService.downloadRecordingsAsZip(recordingIds);
	}
}
