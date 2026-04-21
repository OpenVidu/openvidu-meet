import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute } from '@angular/router';
import { MeetRecordingFilters, MeetRecordingInfo, SortOrder } from '@openvidu-meet/typings';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { ILogger, LoggerService } from '../../../meeting/openvidu-components';
import { MeetingContextService } from '../../../meeting/services';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { RoomService } from '../../../rooms/services/room.service';
import { RecordingListsComponent } from '../../components/recording-lists/recording-lists.component';
import { RecordingTableAction, RecordingTableFilter } from '../../models/recording-list.model';
import { RecordingService } from '../../services/recording.service';

@Component({
	selector: 'ov-room-recordings',
	templateUrl: './room-recordings.component.html',
	styleUrls: ['./room-recordings.component.scss'],
	imports: [MatToolbarModule, MatButtonModule, RecordingListsComponent, MatIconModule, MatProgressSpinnerModule],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomRecordingsComponent implements OnInit {
	protected readonly loggerService = inject(LoggerService);
	protected readonly recordingService = inject(RecordingService);
	protected readonly roomMemberContextService = inject(RoomMemberContextService);
	protected readonly roomService = inject(RoomService);
	protected readonly notificationService = inject(NotificationService);
	protected readonly navigationService = inject(NavigationService);
	protected readonly meetingContextService = inject(MeetingContextService);
	protected readonly route = inject(ActivatedRoute);
	protected log: ILogger = this.loggerService.get('OpenVidu Meet - RoomRecordingsComponent');

	recordings = signal<MeetRecordingInfo[]>([]);
	roomId = '';
	roomName = signal('');
	canDeleteRecordings = false;

	// Loading state
	isInitializing = signal(true);
	showInitialLoader = signal(false);
	isLoading = signal(false);

	initialFilters = signal<RecordingTableFilter>({
		nameFilter: '',
		statusFilter: '',
		sortField: 'startDate',
		sortOrder: SortOrder.DESC
	});

	// Pagination
	hasMoreRecordings = signal(false);
	private nextPageToken?: string;

	async ngOnInit() {
		this.roomId = this.route.snapshot.paramMap.get('room-id')!;
		this.canDeleteRecordings = this.roomMemberContextService.hasPermission('canDeleteRecordings');

		// Load recordings
		const delayLoader = setTimeout(() => {
			this.showInitialLoader.set(true);
		}, 200);

		await this.loadRecordings(this.initialFilters());

		// Set room name based on recordings
		if (this.recordings().length > 0) {
			this.roomName.set(this.recordings()[0].roomName);
		} else {
			// If no recordings, fetch room name from room service
			const { roomName } = await this.roomService.getRoom(this.roomId, { fields: ['roomName'] });
			this.roomName.set(roomName);
		}

		clearTimeout(delayLoader);
		this.showInitialLoader.set(false);
		this.isInitializing.set(false);
	}

	async goBackToRoom() {
		try {
			await this.navigationService.navigateTo(`/room/${this.roomId}`);
		} catch (error) {
			this.log.e('Error navigating back to room:', error);
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

	private async loadRecordings(filters: RecordingTableFilter, refresh = false) {
		const delayLoader = setTimeout(() => {
			this.isLoading.set(true);
		}, 200);

		try {
			const recordingFilters: MeetRecordingFilters = {
				roomId: this.roomId,
				maxItems: 50,
				nextPageToken: !refresh ? this.nextPageToken : undefined,
				sortField: filters.sortField,
				sortOrder: filters.sortOrder
			};

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
			this.hasMoreRecordings.set(response.pagination.isTruncated);
		} catch (error) {
			this.notificationService.showSnackbar('Failed to load recordings');
			this.log.e('Error loading recordings:', error);
		} finally {
			clearTimeout(delayLoader);
			this.isLoading.set(false);
		}
	}

	async loadMoreRecordings(filters: RecordingTableFilter) {
		if (!this.hasMoreRecordings() || this.isLoading()) return;
		await this.loadRecordings(filters);
	}

	async refreshRecordings(filters: RecordingTableFilter) {
		this.nextPageToken = undefined;
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
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete the recording <b>${recording.recordingId}</b>? This action cannot be undone.`,
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
				this.notificationService.showSnackbar(
					`${deleted.length} recording${deleted.length > 1 ? 's' : ''} deleted successfully`
				);
			} catch (error: any) {
				this.log.e('Error deleting recordings:', error);

				const deleted = error.error?.deleted as string[];
				const failed = error.error?.failed as { recordingId: string; error: string }[];

				// Some recordings were deleted, some not
				if (failed.length > 0 || deleted.length > 0) {
					// Remove deleted recordings from the list
					if (deleted.length > 0) {
						this.recordings.set(this.recordings().filter((r) => !deleted.includes(r.recordingId)));
					}

					let msg = '';
					if (deleted.length > 0) {
						msg += `${deleted.length} recording${deleted.length > 1 ? 's' : ''} deleted successfully. `;
					}
					if (failed.length > 0) {
						msg += `${failed.length} recording${failed.length > 1 ? 's' : ''} could not be deleted.`;
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
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete <b>${count} recording${count > 1 ? 's' : ''}</b>? This action cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			confirmCallback: bulkDeleteCallback
		});
	}

	private bulkDownloadRecordings(recordings: MeetRecordingInfo[]) {
		const recordingIds = recordings.map((r) => r.recordingId);
		this.recordingService.downloadRecordingsAsZip(recordingIds);
	}
}
