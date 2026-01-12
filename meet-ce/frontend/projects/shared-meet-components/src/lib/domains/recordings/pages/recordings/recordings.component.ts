import { Component, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { MeetRecordingFilters, MeetRecordingInfo } from '@openvidu-meet/typings';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { NotificationService } from '../../../../shared';
import { RecordingListsComponent, RecordingTableAction, RecordingTableFilter } from '../../components';
import { RecordingService } from '../../services';

@Component({
	selector: 'ov-recordings',
	imports: [RecordingListsComponent, MatIconModule, MatProgressSpinnerModule],
	templateUrl: './recordings.component.html',
	styleUrl: './recordings.component.scss'
})
export class RecordingsComponent implements OnInit {
	recordings = signal<MeetRecordingInfo[]>([]);

	// Loading state
	isInitializing = true;
	showInitialLoader = false;
	isLoading = false;

	initialFilters: RecordingTableFilter = {
		nameFilter: '',
		statusFilter: '',
		sortField: 'startDate',
		sortOrder: 'desc'
	};

	// Pagination
	hasMoreRecordings = false;
	private nextPageToken?: string;

	protected log: ILogger;

	constructor(
		protected loggerService: LoggerService,
		private recordingService: RecordingService,
		private notificationService: NotificationService,
		protected route: ActivatedRoute
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RecordingsComponent');
	}

	async ngOnInit() {
		const roomId = this.route.snapshot.queryParamMap.get('room-id');
		const delayLoader = setTimeout(() => {
			this.showInitialLoader = true;
		}, 200);

		// If a specific room ID is provided, filter recordings by that room
		if (roomId) {
			this.initialFilters.nameFilter = roomId;
		}
		await this.loadRecordings(this.initialFilters);

		clearTimeout(delayLoader);
		this.showInitialLoader = false;
		this.isInitializing = false;
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

	private async loadRecordings(filters: RecordingTableFilter, refresh = false) {
		const delayLoader = setTimeout(() => {
			this.isLoading = true;
		}, 200);

		try {
			const recordingFilters: MeetRecordingFilters = {
				maxItems: 50,
				nextPageToken: !refresh ? this.nextPageToken : undefined,
				sortField: filters.sortField,
				sortOrder: filters.sortOrder
			};

			// Apply room filter if provided
			if (filters.nameFilter) {
				recordingFilters.roomId = filters.nameFilter;
				recordingFilters.roomName = filters.nameFilter;
			}

			// Apply status filter if provided
			if (filters.statusFilter) {
				recordingFilters.status = filters.statusFilter;
			}

			const response = await this.recordingService.listRecordings(recordingFilters);
			let recordings = response.recordings;

			if (!refresh) {
				// Update recordings list
				const currentRecordings = this.recordings();
				this.recordings.set([...currentRecordings, ...recordings]);
			} else {
				// Replace recordings list
				this.recordings.set(recordings);
			}

			// Update pagination
			this.nextPageToken = response.pagination.nextPageToken;
			this.hasMoreRecordings = response.pagination.isTruncated;
		} catch (error) {
			this.notificationService.showSnackbar('Failed to load recordings');
			this.log.e('Error loading recordings:', error);
		} finally {
			clearTimeout(delayLoader);
			this.isLoading = false;
		}
	}

	async loadMoreRecordings(filters: RecordingTableFilter) {
		if (!this.hasMoreRecordings || this.isLoading) return;
		await this.loadRecordings(filters);
	}

	async refreshRecordings(filters: RecordingTableFilter) {
		await this.loadRecordings(filters, true);
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
				this.recordings.set(this.recordings().filter((r) => r.recordingId !== recording.recordingId));

				this.notificationService.showSnackbar('Recording deleted successfully');
			} catch (error) {
				this.log.e('Error deleting recording:', error);
				this.notificationService.showSnackbar('Failed to delete recording');
			}
		};

		this.notificationService.showDialog({
			title: 'Delete Recording',
			icon: 'delete_outline',
			message: `Are you sure you want to delete the recording <b>${recording.recordingId}</b>?`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			confirmCallback: deleteCallback
		});
	}

	private bulkDeleteRecordings(recordings: MeetRecordingInfo[]) {
		const bulkDeleteCallback = async () => {
			try {
				const recordingIds = recordings.map((r) => r.recordingId);
				const { deleted } = await this.recordingService.bulkDeleteRecordings(recordingIds);

				// Remove deleted recordings from the list
				this.recordings.set(this.recordings().filter((r) => !deleted.includes(r.recordingId)));

				this.notificationService.showSnackbar('All recordings deleted successfully');
			} catch (error: any) {
				this.log.e('Error deleting recordings:', error);

				const deleted = error.error?.deleted as string[];
				const failed = error.error?.failed as { recordingId: string; error: string }[];

				// Some recordings were deleted, some not
				if (failed) {
					// Remove deleted recordings from the list
					if (deleted.length > 0) {
						this.recordings.set(this.recordings().filter((r) => !deleted.includes(r.recordingId)));
					}

					let msg = '';
					if (deleted.length > 0) {
						msg += `${deleted.length} recording(s) deleted successfully. `;
					}
					if (failed.length > 0) {
						msg += `${failed.length} recording(s) could not be deleted.`;
					}

					this.notificationService.showSnackbar(msg.trim());
				} else {
					this.notificationService.showSnackbar('Failed to delete recordings');
				}
			}
		};

		const count = recordings.length;
		this.notificationService.showDialog({
			title: 'Delete Recordings',
			icon: 'delete_outline',
			message: `Are you sure you want to delete <b>${count}</b> recordings?`,
			confirmText: 'Delete all',
			cancelText: 'Cancel',
			confirmCallback: bulkDeleteCallback
		});
	}

	private bulkDownloadRecordings(recordings: MeetRecordingInfo[]) {
		const recordingIds = recordings.map((r) => r.recordingId);
		this.recordingService.downloadRecordingsAsZip(recordingIds);
	}
}
