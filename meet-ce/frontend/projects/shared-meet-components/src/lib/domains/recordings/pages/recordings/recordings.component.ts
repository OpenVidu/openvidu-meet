import { Component, computed, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
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
import { ScrollPersistDirective } from '../../../../shared/directives/scroll-persist.directive';
import { EntityListSnapshot, EntityListState } from '../../../../shared/models/entity-list.model';
import { ListStateCacheService } from '../../../../shared/services/list-state-cache.service';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { decodeToken } from '../../../../shared/utils/token.utils';
import { AuthService } from '../../../auth/services/auth.service';
import { RoomMemberService } from '../../../room-members/services/room-member.service';
import { RecordingListsComponent } from '../../components/recording-lists/recording-lists.component';
import { RecordingTableAction, RecordingTableFilter } from '../../models/recording-list.model';
import { RecordingActionsService } from '../../services/recording-actions.service';
import { RecordingService } from '../../services/recording.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import type { ILogger } from '../../../../shared/models/logger.model';

/** Cached UI state for the recordings list, restored when navigating back to it. */
interface RecordingsListCachedState {
	list: EntityListSnapshot<MeetRecordingInfo, RecordingTableFilter>;
	deletableRoomIds: string[];
	scrollTop: number;
}

@Component({
	selector: 'ov-recordings',
	imports: [RecordingListsComponent, MatIconModule, MatProgressSpinnerModule, ScrollPersistDirective, TranslatePipe],
	templateUrl: './recordings.component.html',
	styleUrl: './recordings.component.scss'
})
export class RecordingsComponent implements OnInit, OnDestroy {
	private static readonly STATE_KEY = 'recordings';

	private readonly scroller = viewChild(ScrollPersistDirective);
	/** Scroll position to restore on the page container (set when restoring cached state). */
	protected scrollToRestore = 0;

	protected loggerService: LoggerService = inject(LoggerService);
	private listStateCache = inject(ListStateCacheService);
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
	// Cache: roomId → canDelete (avoids re-fetching tokens for already-seen rooms)
	private roomDeletePermissionCache = new Map<string, boolean>();

	initialFilters = signal<RecordingTableFilter>({
		nameFilter: '',
		nameMatchMode: TextMatchMode.PREFIX,
		nameCaseInsensitive: false,
		statusFilter: '',
		sortField: 'startDate',
		sortOrder: SortOrder.DESC
	});

	protected readonly list = new EntityListState<MeetRecordingInfo, RecordingTableFilter>({
		initialFilters: this.initialFilters(),
		fetchPage: (filters, nextPageToken) => this.fetchRecordingsPage(filters, nextPageToken),
		onLoadError: (error) => {
			this.notificationService.showSnackbar(
				this.translateService.translate('RECORDINGS.ERRORS.LOAD_RECORDINGS_FAILED')
			);
			this.log.e('Error loading recordings:', error);
		}
	});

	async ngOnInit() {
		// Capture the navigation trigger synchronously, before any await finalizes the navigation.
		const isBackNavigation = this.navigationService.isPopStateNavigation();

		const role = await this.authService.getUserRole();
		this.currentUserRole.set(role);

		// Restore cached state only when navigating *back* (browser back/forward); an
		// explicit navigation to this page loads fresh data so others' changes show.
		const cached = this.listStateCache.get<RecordingsListCachedState>(RecordingsComponent.STATE_KEY);

		if (cached && isBackNavigation) {
			this.list.restore(cached.list);
			this.initialFilters.set(cached.list.filters);
			this.deletableRoomIds.set(new Set(cached.deletableRoomIds));
			this.scrollToRestore = cached.scrollTop; // applied by ScrollPersistDirective once rendered
			return;
		}

		await this.list.initialize(this.initialFilters());
	}

	ngOnDestroy() {
		this.listStateCache.set<RecordingsListCachedState>(RecordingsComponent.STATE_KEY, {
			list: this.list.snapshot(),
			deletableRoomIds: [...this.deletableRoomIds()],
			scrollTop: this.scroller()?.scrollTop ?? 0
		});
	}

	async onRecordingAction(action: RecordingTableAction) {
		await this.recordingActions.handle(action, { list: this.list, log: this.log, hasRecordingAccess: true });
	}

	async onRecordingClick(recordingId: string) {
		try {
			await this.navigationService.navigateTo(`/recordings/${recordingId}`);
		} catch (error) {
			this.notificationService.showSnackbar(
				this.translateService.translate('RECORDINGS.ERRORS.NAVIGATE_DETAIL_FAILED')
			);
			this.log.e('Error navigating to recording detail:', error);
		}
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
}
