import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import {
	MeetRecordingFilters,
	MeetRecordingInfo,
	MeetUserRole,
	SortOrder,
	TextMatchMode
} from '@openvidu-meet/typings';
import { NavigationService } from 'projects/shared-meet-components/src/lib/shared/services/navigation.service';
import { DialogPresetsService } from '../../../../shared/services/dialog-presets.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { decodeToken } from '../../../../shared/utils/token.utils';
import { AuthService } from '../../../auth/services/auth.service';
import { ILogger, LoggerService } from '../../../meeting/openvidu-components';
import { RoomMemberService } from '../../../room-members/services/room-member.service';
import { RecordingListsComponent } from '../../components/recording-lists/recording-lists.component';
import { RecordingTableAction, RecordingTableFilter } from '../../models/recording-list.model';
import { RecordingService } from '../../services/recording.service';

@Component({
	selector: 'ov-recordings',
	imports: [RecordingListsComponent, MatIconModule, MatProgressSpinnerModule],
	templateUrl: './recordings.component.html',
	styleUrl: './recordings.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordingsComponent implements OnInit {
	protected loggerService: LoggerService = inject(LoggerService);
	private authService: AuthService = inject(AuthService);
	private recordingService: RecordingService = inject(RecordingService);
	private roomMemberService: RoomMemberService = inject(RoomMemberService);
	private notificationService: NotificationService = inject(NotificationService);
	private dialogPresetsService = inject(DialogPresetsService);
	protected route: ActivatedRoute = inject(ActivatedRoute);
	protected navigationService: NavigationService = inject(NavigationService);
	protected log: ILogger = this.loggerService.get('OpenVidu Meet - RecordingsComponent');

	recordings = signal<MeetRecordingInfo[]>([]);

	// Permission signals
	protected currentUserRole = signal<MeetUserRole | undefined>(undefined);
	canDeleteRecordings = computed(() => this.currentUserRole() === MeetUserRole.ADMIN);
	deletableRoomIds = signal<Set<string>>(new Set());
	// Cache: roomId → canDelete (avoids re-fetching tokens for already-seen rooms)
	private roomDeletePermissionCache = new Map<string, boolean>();

	// Loading state
	isInitializing = signal(true);
	showInitialLoader = signal(false);
	isLoading = signal(false);

	initialFilters = signal<RecordingTableFilter>({
		nameFilter: '',
		nameMatchMode: TextMatchMode.PREFIX,
		nameCaseInsensitive: false,
		statusFilter: '',
		sortField: 'startDate',
		sortOrder: SortOrder.DESC
	});

	// Pagination
	hasMoreRecordings = signal(false);
	private nextPageToken?: string;

	// Track current active filters so deletions can trigger auto-load
	private currentFilters: RecordingTableFilter = this.initialFilters();

	async ngOnInit() {
		const role = await this.authService.getUserRole();
		this.currentUserRole.set(role);

		const delayLoader = setTimeout(() => {
			this.showInitialLoader.set(true);
		}, 200);

		await this.loadRecordings(this.initialFilters());

		clearTimeout(delayLoader);
		this.showInitialLoader.set(false);
		this.isInitializing.set(false);
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

	async onRecordingClick(recordingId: string) {
		try {
			await this.navigationService.navigateTo(`/recordings/${recordingId}`);
		} catch (error) {
			this.notificationService.showSnackbar('Error navigating to recording detail');
			this.log.e('Error navigating to recording detail:', error);
		}
	}

	private async autoLoadIfEmpty() {
		if (this.recordings().length === 0 && this.hasMoreRecordings()) {
			await this.loadRecordings(this.currentFilters);
		}
	}

	private async loadRecordings(filters: RecordingTableFilter, refresh = false) {
		this.currentFilters = filters;
		const delayLoader = setTimeout(() => {
			this.isLoading.set(true);
		}, 200);

		try {
			const recordingFilters: MeetRecordingFilters = {
				maxItems: 50,
				nextPageToken: !refresh ? this.nextPageToken : undefined,
				sortField: filters.sortField,
				sortOrder: filters.sortOrder
			};

			// Apply room name filter if provided
			if (filters.nameFilter) {
				recordingFilters.roomName = filters.nameFilter;
				recordingFilters.roomNameMatchMode = filters.nameMatchMode;
				recordingFilters.roomNameCaseInsensitive = filters.nameCaseInsensitive || undefined;
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
			this.hasMoreRecordings.set(response.pagination.isTruncated);

			// Resolve per-room delete permissions for the newly loaded recordings
			await this.resolveDeletePermissions(recordings);
		} catch (error) {
			this.notificationService.showSnackbar('Failed to load recordings');
			this.log.e('Error loading recordings:', error);
		} finally {
			clearTimeout(delayLoader);
			this.isLoading.set(false);
		}
	}

	/**
	 * For non-ADMIN users, fetches room member tokens for any newly loaded room IDs
	 * and updates the deletableRoomIds signal using a per-session cache.
	 */
	private async resolveDeletePermissions(recordings: MeetRecordingInfo[]) {
		if (this.currentUserRole() === MeetUserRole.ADMIN) return; // ADMIN: handled by canDeleteRecordings=true

		const unseenRoomIds = [...new Set(recordings.map((r) => r.roomId))].filter(
			(id) => !this.roomDeletePermissionCache.has(id)
		);

		if (unseenRoomIds.length === 0) return;

		await Promise.all(
			unseenRoomIds.map(async (roomId) => {
				try {
					const { token } = await this.roomMemberService.generateRoomMemberToken(roomId, {
						joinMeeting: false
					});
					const decoded = decodeToken(token);
					this.roomDeletePermissionCache.set(roomId, decoded.metadata.permissions.canDeleteRecordings);
				} catch {
					this.roomDeletePermissionCache.set(roomId, false);
				}
			})
		);

		// Rebuild signal from updated cache
		const deletable = new Set(
			[...this.roomDeletePermissionCache.entries()].filter(([, canDelete]) => canDelete).map(([id]) => id)
		);
		this.deletableRoomIds.set(deletable);
	}

	async loadMoreRecordings(filters: RecordingTableFilter) {
		if (!this.hasMoreRecordings() || this.isLoading()) return;
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
		this.recordingService.openShareRecordingDialog(recording.recordingId, true);
	}

	private deleteRecording(recording: MeetRecordingInfo) {
		const deleteCallback = async () => {
			try {
				await this.recordingService.deleteRecording(recording.recordingId);

				// Remove from local list
				this.recordings.set(this.recordings().filter((r) => r.recordingId !== recording.recordingId));
				this.notificationService.showSnackbar('Recording deleted successfully');
				await this.autoLoadIfEmpty();
			} catch (error) {
				this.log.e('Error deleting recording:', error);
				this.notificationService.showSnackbar('Failed to delete recording');
			}
		};

		this.notificationService.showDialog({
			...this.dialogPresetsService.getDeleteRecordingDialogPreset(recording.recordingId),
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
				await this.autoLoadIfEmpty();
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
					await this.autoLoadIfEmpty();
				} else {
					this.notificationService.showSnackbar('Failed to delete recordings');
				}
			}
		};

		const count = recordings.length;
		this.notificationService.showDialog({
			...this.dialogPresetsService.getBulkDeleteRecordingsDialogPreset(count),
			confirmCallback: bulkDeleteCallback
		});
	}

	private bulkDownloadRecordings(recordings: MeetRecordingInfo[]) {
		const recordingIds = recordings.map((r) => r.recordingId);
		this.recordingService.downloadRecordingsAsZip(recordingIds);
	}
}
