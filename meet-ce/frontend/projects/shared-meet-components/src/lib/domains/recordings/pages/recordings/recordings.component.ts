import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { MeetRecordingFilters, MeetRecordingInfo, MeetUserRole } from '@openvidu-meet/typings';
import { EntityListState } from '../../../../shared/models/entity-list.model';
import { ListUrlState } from '../../../../shared/models/list-url-state';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { decodeToken } from '../../../../shared/utils/token.utils';
import { AuthService } from '../../../auth/services/auth.service';
import { RoomMemberService } from '../../../room-members/services/room-member.service';
import { RecordingListsComponent } from '../../components/recording-lists/recording-lists.component';
import {
	RECORDING_FILTER_DEFAULTS,
	RECORDING_FILTER_URL_PARAMS,
	RecordingTableAction,
	RecordingTableFilter
} from '../../models/recording-list.model';
import { RecordingActionsService } from '../../services/recording-actions.service';
import { RecordingService } from '../../services/recording.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import type { ILogger } from '../../../../shared/models/logger.model';

@Component({
	selector: 'ov-recordings',
	imports: [RecordingListsComponent, MatIconModule, MatProgressSpinnerModule, TranslatePipe],
	templateUrl: './recordings.component.html',
	styleUrl: './recordings.component.scss'
})
export class RecordingsComponent implements OnInit {
	protected loggerService: LoggerService = inject(LoggerService);
	private authService: AuthService = inject(AuthService);
	private recordingService: RecordingService = inject(RecordingService);
	private recordingActions = inject(RecordingActionsService);
	private roomMemberService: RoomMemberService = inject(RoomMemberService);
	private notificationService: NotificationService = inject(NotificationService);
	private readonly translateService = inject(TranslateService);
	protected route: ActivatedRoute = inject(ActivatedRoute);
	protected navigationService: NavigationService = inject(NavigationService);
	protected log: ILogger = this.loggerService.get('OpenVidu Meet - RecordingsComponent');

	// Permission signals
	protected currentUserRole = signal<MeetUserRole | undefined>(undefined);
	canDeleteRecordings = computed(() => this.currentUserRole() === MeetUserRole.ADMIN);
	deletableRoomIds = signal<Set<string>>(new Set());
	canDownloadRecordings = computed(() => this.currentUserRole() === MeetUserRole.ADMIN);
	downloadableRoomIds = signal<Set<string>>(new Set());
	canPlayRecordings = computed(() => this.currentUserRole() === MeetUserRole.ADMIN);
	playableRoomIds = signal<Set<string>>(new Set());
	// Cache: roomId → permissions decoded from the room member token (avoids re-fetching tokens for
	// already-seen rooms)
	private roomDeletePermissionCache = new Map<string, boolean>();
	private roomDownloadPermissionCache = new Map<string, boolean>();
	private roomPlayPermissionCache = new Map<string, boolean>();

	protected readonly urlState = new ListUrlState(RECORDING_FILTER_DEFAULTS, RECORDING_FILTER_URL_PARAMS);
	initialFilters = signal(this.urlState.current);

	protected readonly list = new EntityListState<MeetRecordingInfo, RecordingTableFilter>({
		initialFilters: this.initialFilters(),
		fetchPage: (filters, nextPageToken) => this.fetchRecordingsPage(filters, nextPageToken),
		onLoadError: (error) => {
			this.notificationService.showMessage(
				this.translateService.translate('RECORDINGS.ERRORS.LOAD_RECORDINGS_FAILED')
			);
			this.log.e('Error loading recordings:', error);
		}
	});

	async ngOnInit() {
		this.currentUserRole.set(await this.authService.getUserRole());

		await this.list.initialize(this.initialFilters());
		this.urlState.onChange((filters) => {
			this.initialFilters.set(filters);
			void this.list.refresh(filters);
		});
	}

	async onRecordingAction(action: RecordingTableAction) {
		await this.recordingActions.handle(action, {
			list: this.list,
			log: this.log,
			canPlayRecording: ({ roomId }) => this.canPlayRecordings() || this.playableRoomIds().has(roomId)
		});
	}

	private async fetchRecordingsPage(filters: RecordingTableFilter, nextPageToken: string | undefined) {
		const recordingFilters: MeetRecordingFilters = {
			maxItems: 50,
			nextPageToken,
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

		// Resolve per-room delete permissions for the newly loaded recordings
		await this.resolveDeletePermissions(response.recordings);

		return {
			items: response.recordings,
			nextPageToken: response.pagination.nextPageToken,
			hasMore: response.pagination.isTruncated
		};
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
					this.roomDeletePermissionCache.set(roomId, decoded.metadata.permissions.recordingDelete);
					this.roomDownloadPermissionCache.set(roomId, decoded.metadata.permissions.recordingDownload);
					this.roomPlayPermissionCache.set(roomId, decoded.metadata.permissions.recordingPlay);
				} catch {
					this.roomDeletePermissionCache.set(roomId, false);
					this.roomDownloadPermissionCache.set(roomId, false);
					this.roomPlayPermissionCache.set(roomId, false);
				}
			})
		);

		// Rebuild signals from updated caches
		const deletable = new Set(
			[...this.roomDeletePermissionCache.entries()].filter(([, canDelete]) => canDelete).map(([id]) => id)
		);
		this.deletableRoomIds.set(deletable);
		const downloadable = new Set(
			[...this.roomDownloadPermissionCache.entries()].filter(([, canDownload]) => canDownload).map(([id]) => id)
		);
		this.downloadableRoomIds.set(downloadable);
		const playable = new Set(
			[...this.roomPlayPermissionCache.entries()].filter(([, canPlay]) => canPlay).map(([id]) => id)
		);
		this.playableRoomIds.set(playable);
	}
}
