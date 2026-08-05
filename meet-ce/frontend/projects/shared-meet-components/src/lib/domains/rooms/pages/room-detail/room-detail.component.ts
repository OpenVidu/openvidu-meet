import { Clipboard } from '@angular/cdk/clipboard';
import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterModule } from '@angular/router';
import {
	MeetRecordingFilters,
	MeetRecordingInfo,
	MeetRoom,
	MeetRoomDeletionSuccessCode,
	MeetRoomMember,
	MeetRoomMemberFilters,
	MeetRoomStatus,
	MeetUserRole,
	SortOrder,
	TextMatchMode
} from '@openvidu-meet/typings';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../../shared/components/breadcrumb/breadcrumb.component';
import { ScrollPersistDirective } from '../../../../shared/directives/scroll-persist.directive';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { DialogPresetsService } from '../../../../shared/services/dialog-presets.service';
import { EntityListSnapshot, EntityListState } from '../../../../shared/models/entity-list.model';
import { ListStateCacheService } from '../../../../shared/services/list-state-cache.service';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { parseBulkDeleteError } from '../../../../shared/utils/bulk-delete.utils';
import { decodeToken } from '../../../../shared/utils/token.utils';
import { AuthService } from '../../../auth/services/auth.service';
import { RecordingListsComponent } from '../../../recordings/components/recording-lists/recording-lists.component';
import { RecordingTableAction, RecordingTableFilter } from '../../../recordings/models/recording-list.model';
import { RecordingActionsService } from '../../../recordings/services/recording-actions.service';
import { RecordingService } from '../../../recordings/services/recording.service';
import {
	MemberTableAction,
	MemberTableFilter,
	RoomMembersListsComponent
} from '../../../room-members/components/room-members-list/room-members-list.component';
import { RoomMemberService } from '../../../room-members/services/room-member.service';
import { RoomShareDialogComponent } from '../../components/room-share-dialog/room-share-dialog.component';
import { RoomDeletionService } from '../../services/room-deletion.service';
import { RoomService } from '../../services/room.service';
import { RoomUiUtils } from '../../utils/ui';
import { LoggerService } from '../../../../shared/services/logger.service';
import type { ILogger } from '../../../../shared/models/logger.model';

/** Cached UI state for the room detail page (both tabs), restored on return. */
interface RoomDetailCachedState {
	room: MeetRoom;
	canViewRecordings: boolean;
	canDeleteRecordings: boolean;
	selectedTabIndex: number;
	members: EntityListSnapshot<MeetRoomMember, MemberTableFilter>;
	recordings: EntityListSnapshot<MeetRecordingInfo, RecordingTableFilter>;
	scrollTop: number;
}

@Component({
	selector: 'ov-room-detail',
	imports: [
		DatePipe,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatChipsModule,
		MatTabsModule,
		RouterModule,
		BreadcrumbComponent,
		RecordingListsComponent,
		RoomMembersListsComponent,
		ScrollPersistDirective,
		TranslatePipe
	],
	templateUrl: './room-detail.component.html',
	styleUrl: './room-detail.component.scss'
})
export class RoomDetailComponent implements OnInit, OnDestroy {
	private readonly route = inject(ActivatedRoute);
	private readonly listStateCache = inject(ListStateCacheService);
	private readonly authService = inject(AuthService);
	private readonly roomService = inject(RoomService);
	private readonly roomDeletionService = inject(RoomDeletionService);
	private readonly roomMemberService = inject(RoomMemberService);
	private readonly recordingService = inject(RecordingService);
	private readonly recordingActions = inject(RecordingActionsService);
	private readonly notificationService = inject(NotificationService);
	private readonly dialogPresetsService = inject(DialogPresetsService);
	private readonly translateService = inject(TranslateService);
	protected readonly navigationService = inject(NavigationService);
	private readonly clipboard = inject(Clipboard);
	private readonly dialog = inject(MatDialog);
	private readonly loggerService = inject(LoggerService);
	protected readonly log: ILogger = this.loggerService.get('OpenVidu Meet - RoomDetailComponent');

	private readonly scroller = viewChild(ScrollPersistDirective);
	/** Scroll position to restore on the page container (set when restoring cached state). */
	protected scrollToRestore = 0;


	currentUserId = signal<string>('');
	currentUserRole = signal<MeetUserRole | undefined>(undefined);
	canViewUserProfiles = computed(
		() => !!this.currentUserRole() && this.currentUserRole() !== MeetUserRole.ROOM_MEMBER
	);
	canManageRoom = computed(() => {
		const room = this.room();

		if (!room) return false;

		return RoomUiUtils.canManageRoom(room, this.currentUserId(), this.currentUserRole());
	});
	canViewRecordings = signal(false);
	canDeleteRecordings = signal(false);

	roomId = signal('');
	room = signal<MeetRoom | undefined>(undefined);
	isInitializing = signal(true);
	showInitialLoader = signal(false);
	breadcrumbItems = signal<BreadcrumbItem[]>([]);

	// Room Members tab
	initialMemberFilters = signal<MemberTableFilter>({
		nameFilter: '',
		nameMatchMode: TextMatchMode.PREFIX,
		nameCaseInsensitive: false,
		baseRole: '',
		type: '',
		sortField: 'membershipDate',
		sortOrder: SortOrder.DESC
	});

	protected readonly memberList = new EntityListState<MeetRoomMember, MemberTableFilter>({
		initialFilters: this.initialMemberFilters(),
		fetchPage: (filters, nextPageToken) => this.fetchMembersPage(filters, nextPageToken),
		onLoadError: (error) => {
			this.log.e('Error loading room members:', error);
			this.notificationService.showSnackbar('Failed to load room members');
		}
	});

	// Recordings tab
	initialRecordingFilters = signal<RecordingTableFilter>({
		nameFilter: '',
		nameMatchMode: TextMatchMode.PREFIX,
		nameCaseInsensitive: false,
		statusFilter: '',
		sortField: 'startDate',
		sortOrder: SortOrder.DESC
	});

	protected readonly recordingList = new EntityListState<MeetRecordingInfo, RecordingTableFilter>({
		initialFilters: this.initialRecordingFilters(),
		fetchPage: (filters, nextPageToken) => this.fetchRecordingsPage(filters, nextPageToken),
		onLoadError: (error) => {
			this.log.e('Error loading recordings:', error);
			this.notificationService.showSnackbar('Failed to load recordings');
		}
	});

	// Tab management
	selectedTabIndex = signal(0);

	protected readonly RoomUiUtils = RoomUiUtils;

	async ngOnInit() {
		// Capture the navigation trigger synchronously, before any await finalizes the navigation.
		const isBackNavigation = this.navigationService.isPopStateNavigation();

		const roomId = this.route.snapshot.paramMap.get('room-id');

		if (!roomId) {
			await this.navigationService.navigateTo('/rooms');
			return;
		}

		this.roomId.set(roomId);

		// Update breadcrumb items
		this.breadcrumbItems.set([
			{
				label: this.translateService.translate('ROOMS.DETAIL.BREADCRUMB_ROOMS'),
				action: () => this.navigationService.navigateTo('/rooms')
			},
			{
				label: roomId
			}
		]);

		const [userId, role] = await Promise.all([this.authService.getUserId(), this.authService.getUserRole()]);
		this.currentUserId.set(userId ?? '');
		this.currentUserRole.set(role);

		// Restore cached state only when navigating *back* (browser back/forward), e.g.
		// from a member edit page. Opening this room afresh (clicking it) loads fresh data.
		const cached = this.listStateCache.get<RoomDetailCachedState>(this.cacheKey());

		if (cached && isBackNavigation) {
			this.room.set(cached.room);
			this.canViewRecordings.set(cached.canViewRecordings);
			this.canDeleteRecordings.set(cached.canDeleteRecordings);
			this.memberList.restore(cached.members);
			this.initialMemberFilters.set(cached.members.filters);
			this.recordingList.restore(cached.recordings);
			this.initialRecordingFilters.set(cached.recordings.filters);

			// An explicit ?tab=members request wins over the cached tab.
			if (this.route.snapshot.queryParamMap.get('tab') === 'members' && this.canManageRoom()) {
				this.selectedTabIndex.set(1);
			} else {
				this.selectedTabIndex.set(cached.selectedTabIndex);
			}

			this.scrollToRestore = cached.scrollTop; // applied by ScrollPersistDirective once rendered
			this.isInitializing.set(false);
			return;
		}

		const delayLoader = setTimeout(() => {
			this.showInitialLoader.set(true);
		}, 200);

		await this.loadRoomDetails();

		// Open the Room Members tab directly when requested (e.g. after adding a member)
		if (this.route.snapshot.queryParamMap.get('tab') === 'members' && this.canManageRoom()) {
			this.selectedTabIndex.set(1);
		}

		clearTimeout(delayLoader);
		this.showInitialLoader.set(false);
		this.isInitializing.set(false);
	}

	ngOnDestroy() {
		const room = this.room();

		// Only cache once the room has loaded; nothing useful to restore otherwise.
		if (!room) return;

		this.listStateCache.set<RoomDetailCachedState>(this.cacheKey(), {
			room,
			canViewRecordings: this.canViewRecordings(),
			canDeleteRecordings: this.canDeleteRecordings(),
			selectedTabIndex: this.selectedTabIndex(),
			members: this.memberList.snapshot(),
			recordings: this.recordingList.snapshot(),
			scrollTop: this.scroller()?.scrollTop ?? 0
		});
	}

	private cacheKey(): string {
		return `rooms/${this.roomId()}`;
	}

	// --- Room management ---

	private async loadRoomDetails() {
		try {
			const room = await this.roomService.getRoom(this.roomId());
			this.room.set(room);

			// Determine recording permissions: managers always can view and delete; others need token-based permissions check
			if (this.canManageRoom()) {
				this.canViewRecordings.set(true);
				this.canDeleteRecordings.set(true);
			} else {
				try {
					const { token } = await this.roomMemberService.generateRoomMemberToken(this.roomId(), {
						joinMeeting: false
					});
					const decoded = decodeToken(token);
					this.canViewRecordings.set(decoded.metadata.permissions.canRetrieveRecordings);
					this.canDeleteRecordings.set(decoded.metadata.permissions.canDeleteRecordings);
				} catch {
					this.canViewRecordings.set(false);
					this.canDeleteRecordings.set(false);
				}
			}

			// Load initial data for visible tabs only
			const tabLoads: Promise<unknown>[] = [];

			if (this.canViewRecordings()) {
				tabLoads.push(this.recordingList.load(this.initialRecordingFilters()));
			}

			if (this.canManageRoom()) {
				tabLoads.push(this.memberList.load(this.initialMemberFilters()));
			}

			await Promise.all(tabLoads);
		} catch (error) {
			this.log.e('Error loading room details:', error);
			this.notificationService.showSnackbar(
				this.translateService.translate('ROOMS.ERRORS.FAILED_LOAD_ROOM_DETAILS')
			);
			await this.navigationService.navigateTo('/rooms');
		}
	}

	async accessRoom() {
		const room = this.room()!;
		window.open(room.access.user.url, '_blank');
	}

	shareLink() {
		const room = this.room()!;
		this.dialog.open(RoomShareDialogComponent, {
			width: '450px',
			data: { access: room.access, roomId: room.roomId, canManageRoom: this.canManageRoom() },
			panelClass: 'ov-meet-dialog'
		});
	}

	async editRoom() {
		const room = this.room()!;
		await this.navigationService.navigateTo(`/rooms/${room.roomId}/edit`);
	}

	async toggleRoomStatus() {
		const room = this.room()!;

		if (room.status !== MeetRoomStatus.CLOSED) {
			await this.closeRoom();
		} else {
			await this.reopenRoom();
		}
	}

	private async reopenRoom() {
		try {
			const updatedRoom = await this.roomService.updateRoomStatus(this.roomId(), MeetRoomStatus.OPEN);
			this.room.set(updatedRoom);
			this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.ROOM_REOPENED'));
		} catch (error) {
			this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.FAILED_REOPEN_ROOM'));
			this.log.e('Error reopening room:', error);
		}
	}

	private async closeRoom() {
		try {
			const updatedRoom = await this.roomService.updateRoomStatus(this.roomId(), MeetRoomStatus.CLOSED);
			this.room.set(updatedRoom);

			// The close is applied immediately unless a meeting is still active, in which case
			// it is scheduled to take effect when the meeting ends.
			const message =
				updatedRoom.status === MeetRoomStatus.CLOSED
					? this.translateService.translate('ROOMS.ERRORS.ROOM_CLOSED')
					: this.translateService.translate('ROOMS.ERRORS.ROOM_SCHEDULED_CLOSE');
			this.notificationService.showSnackbar(message);
		} catch (error) {
			this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.FAILED_CLOSE_ROOM'));
			this.log.e('Error closing room:', error);
		}
	}

	deleteRoom() {
		this.roomDeletionService.deleteRoomWithConfirmation({
			roomId: this.roomId(),
			log: this.log,
			onSuccess: async ({ successCode, message, room: updatedRoom }) => {
				await this.handleSuccessfulDeletion(successCode, message, updatedRoom);
			}
		});
	}

	private async handleSuccessfulDeletion(
		successCode: MeetRoomDeletionSuccessCode,
		message: string,
		updatedRoom?: MeetRoom
	) {
		if (updatedRoom) {
			// Room was not deleted but updated (e.g., closed due to active meeting)
			if (successCode === MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_CLOSED) {
				updatedRoom.status = MeetRoomStatus.CLOSED;
			}

			this.room.set(updatedRoom);
		} else {
			// Room was deleted, navigate back to the rooms list (refreshed so the deleted room is gone)
			await this.navigationService.navigateToAndInvalidate('/rooms', 'rooms');
		}

		this.notificationService.showSnackbar(this.roomDeletionService.removeRoomIdFromMessage(message));
	}

	// --- Room Members management ---

	private async fetchMembersPage(filters: MemberTableFilter, nextPageToken: string | undefined) {
		const memberFilters: MeetRoomMemberFilters = {
			maxItems: 50,
			nextPageToken,
			sortField: filters.sortField,
			sortOrder: filters.sortOrder
		};

		// Apply member name filter if provided
		if (filters.nameFilter) {
			memberFilters.name = filters.nameFilter;
			memberFilters.nameMatchMode = filters.nameMatchMode;
			memberFilters.nameCaseInsensitive = filters.nameCaseInsensitive || undefined;
		}

		// Apply base role filter if provided
		if (filters.baseRole) {
			memberFilters.baseRole = filters.baseRole;
		}

		// Apply member type filter if provided
		if (filters.type) {
			memberFilters.type = filters.type;
		}

		const response = await this.roomMemberService.listRoomMembers(this.roomId(), memberFilters);

		return {
			items: response.members,
			nextPageToken: response.pagination.nextPageToken,
			hasMore: response.pagination.isTruncated
		};
	}

	async onMemberAction(action: MemberTableAction) {
		switch (action.action) {
			case 'addMember':
				await this.addMember();
				break;
			case 'edit':
				await this.editMember(action.members[0]);
				break;
			case 'copyLink':
				this.copyMemberLink(action.members[0]);
				break;
			case 'delete':
				this.deleteMember(action.members[0]);
				break;
			case 'bulkDelete':
				this.bulkDeleteMembers(action.members);
				break;
		}
	}

	private async addMember() {
		await this.navigationService.navigateTo(`/rooms/${this.roomId()}/members/new`);
	}

	private async editMember(member: MeetRoomMember) {
		await this.navigationService.navigateTo(`/rooms/${this.roomId()}/members/${member.memberId}/edit`);
	}

	private copyMemberLink(member: MeetRoomMember) {
		this.clipboard.copy(member.accessUrl);
		this.notificationService.showSnackbar('Member access link copied to clipboard');
	}

	private deleteMember(member: MeetRoomMember) {
		this.notificationService.showDialog({
			...this.dialogPresetsService.getRemoveMemberDialogPreset(member.name, this.shouldShowMeetingKickWarning()),
			confirmCallback: async () => {
				try {
					await this.roomMemberService.deleteRoomMember(this.roomId(), member.memberId);

					this.memberList.remove((m) => m.memberId === member.memberId);
					this.notificationService.showSnackbar(`Member "${member.name}" removed successfully`);
					await this.memberList.autoLoadIfEmpty();
				} catch (error) {
					this.log.e('Error removing member:', error);
					this.notificationService.showSnackbar('Failed to remove member');
				}
			}
		});
	}

	private bulkDeleteMembers(members: MeetRoomMember[]) {
		const bulkDeleteCallback = async () => {
			try {
				const memberIds = members.map((m) => m.memberId);
				const { deleted } = await this.roomMemberService.bulkDeleteRoomMembers(this.roomId(), memberIds);

				this.memberList.remove((m) => deleted.includes(m.memberId));
				this.notificationService.showSnackbar(
					`${deleted.length} member${deleted.length > 1 ? 's' : ''} removed successfully`
				);
				await this.memberList.autoLoadIfEmpty();
			} catch (error) {
				this.log.e('Error removing members:', error);

				const { deleted, failed } = parseBulkDeleteError<{ memberId: string; error: string }>(error);

				// Nothing structured to report (401, 500, network drop): plain failure.
				if (deleted.length === 0 && failed.length === 0) {
					this.notificationService.showSnackbar('Failed to remove members');
					return;
				}

				// Partial result: some members were removed, some not.
				this.memberList.remove((m) => deleted.includes(m.memberId));

				let msg = '';

				if (deleted.length > 0) {
					msg += `${deleted.length} member${deleted.length > 1 ? 's' : ''} removed successfully. `;
				}

				if (failed.length > 0) {
					msg += `${failed.length} member${failed.length > 1 ? 's' : ''} could not be removed.`;
				}

				this.notificationService.showSnackbar(msg.trim());
				await this.memberList.autoLoadIfEmpty();
			}
		};

		const count = members.length;
		this.notificationService.showDialog({
			...this.dialogPresetsService.getBulkRemoveMembersDialogPreset(count, this.shouldShowMeetingKickWarning()),
			confirmCallback: bulkDeleteCallback
		});
	}

	private shouldShowMeetingKickWarning(): boolean {
		return this.room()?.status === MeetRoomStatus.ACTIVE_MEETING;
	}

	// --- Recordings management ---

	private async fetchRecordingsPage(filters: RecordingTableFilter, nextPageToken: string | undefined) {
		const recordingFilters: MeetRecordingFilters = {
			roomId: this.roomId(),
			maxItems: 50,
			nextPageToken,
			sortField: filters.sortField,
			sortOrder: filters.sortOrder
		};

		// Apply status filter if provided
		if (filters.statusFilter) {
			recordingFilters.status = filters.statusFilter;
		}

		const response = await this.recordingService.listRecordings(recordingFilters);

		return {
			items: response.recordings,
			nextPageToken: response.pagination.nextPageToken,
			hasMore: response.pagination.isTruncated
		};
	}

	async onRecordingAction(action: RecordingTableAction) {
		await this.recordingActions.handle(action, {
			list: this.recordingList,
			log: this.log,
			hasRecordingAccess: true
		});
	}

	async onRecordingClick(recordingId: string) {
		try {
			await this.navigationService.navigateTo(`/recordings/${recordingId}`);
		} catch (error) {
			this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.NAVIGATING_RECORDING_DETAIL'));
			this.log.e('Error navigating to recording detail:', error);
		}
	}
}
