import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute } from '@angular/router';
import { MeetRecordingFilters, MeetRecordingInfo } from '@openvidu-meet/typings';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { RecordingListsComponent, RecordingTableAction } from '../../components';
import {
	MeetingContextService,
	NavigationService,
	NotificationService,
	RecordingService,
	RoomMemberService
} from '../../services';

@Component({
	selector: 'ov-room-recordings',
	templateUrl: './room-recordings.component.html',
	styleUrls: ['./room-recordings.component.scss'],
	imports: [MatToolbarModule, MatButtonModule, RecordingListsComponent, MatIconModule, MatProgressSpinnerModule]
})
export class RoomRecordingsComponent implements OnInit {
	recordings = signal<MeetRecordingInfo[]>([]);
	roomId = '';
	roomName = '';
	canDeleteRecordings = false;

	// Loading state
	isInitializing = true;
	showInitialLoader = false;
	isLoading = false;

	// Pagination
	hasMoreRecordings = false;
	private nextPageToken?: string;

	protected log: ILogger;

	protected readonly loggerService = inject(LoggerService);
	protected readonly recordingService = inject(RecordingService);
	protected readonly roomMemberService = inject(RoomMemberService);
	protected readonly notificationService = inject(NotificationService);
	protected readonly navigationService = inject(NavigationService);
	protected readonly meetingContextService = inject(MeetingContextService);
	protected readonly route = inject(ActivatedRoute);

	constructor() {
		this.log = this.loggerService.get('OpenVidu Meet - RoomRecordingsComponent');
	}

	async ngOnInit() {
		this.roomId = this.route.snapshot.paramMap.get('room-id')!;
		this.canDeleteRecordings = this.roomMemberService.canDeleteRecordings();

		// Load recordings
		const delayLoader = setTimeout(() => {
			this.showInitialLoader = true;
		}, 200);

		await this.loadRecordings();

		clearTimeout(delayLoader);
		this.showInitialLoader = false;
		this.isInitializing = false;

		// Set room name based on recordings or roomId
		if (this.recordings()) {
			this.roomName = this.recordings()[0].roomName;
		} else {
			const parts = this.roomId.split('-');
			this.roomName = parts.slice(0, -1).join('-');
		}
	}

	async goBackToRoom() {
		try {
			const roomSecret = this.meetingContextService.roomSecret();
			if (!roomSecret) throw new Error('Cannot navigate back to room: room secret is undefined');
			await this.navigationService.navigateTo(`/room/${this.roomId}`, {
				secret: roomSecret
			});
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

	private async loadRecordings(statusFilter?: string, refresh = false) {
		const delayLoader = setTimeout(() => {
			this.isLoading = true;
		}, 200);

		try {
			const recordingFilters: MeetRecordingFilters = {
				roomId: this.roomId,
				maxItems: 50,
				nextPageToken: !refresh ? this.nextPageToken : undefined
			};

			const response = await this.recordingService.listRecordings(recordingFilters);

			// Filter by status on client side if needed
			let filteredRecordings = response.recordings;
			if (statusFilter) {
				filteredRecordings = response.recordings.filter((r) => r.status === statusFilter);
			}

			if (!refresh) {
				// Update recordings list
				const currentRecordings = this.recordings();
				this.recordings.set([...currentRecordings, ...filteredRecordings]);
			} else {
				// Replace recordings list
				this.recordings.set(filteredRecordings);
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

	async loadMoreRecordings() {
		if (!this.hasMoreRecordings || this.isLoading) return;
		await this.loadRecordings();
	}

	async refreshRecordings() {
		await this.loadRecordings(undefined, true);
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

	private sortRecordingsByDate(recordings: MeetRecordingInfo[]) {
		return recordings.sort((a, b) => {
			const dateA = new Date(a.startDate || -1);
			const dateB = new Date(b.startDate || -1);
			return dateA.getTime() - dateB.getTime();
		});
	}
}
