import { Component, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import {
	MeetRoom,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomDeletionSuccessCode,
	MeetRoomFilters,
	MeetRoomStatus,
	MeetUserRole,
	SortOrder,
	TextMatchMode
} from '@openvidu-meet/typings';
import { ScrollPersistDirective } from '../../../../shared/directives/scroll-persist.directive';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { DialogPresetsService } from '../../../../shared/services/dialog-presets.service';
import { ListStateCacheService } from '../../../../shared/services/list-state-cache.service';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { AuthService } from '../../../auth/services/auth.service';

import { DeleteRoomDialogOptions } from '../../../../shared/models/notification.model';
import { DeleteRoomDialogComponent } from '../../components/delete-room-dialog/delete-room-dialog.component';
import { RoomShareDialogComponent } from '../../components/room-share-dialog/room-share-dialog.component';
import {
	RoomsListsComponent,
	RoomTableAction,
	RoomTableFilter
} from '../../components/rooms-lists/rooms-lists.component';
import { RoomDeletionService } from '../../services/room-deletion.service';
import { RoomService } from '../../services/room.service';
import { RoomUiUtils } from '../../utils/ui';
import { LoggerService } from '../../../../shared/services/logger.service';
import type { ILogger } from '../../../../shared/models/logger.model';

/** Cached UI state for the rooms list, restored when navigating back to it. */
interface RoomsListCachedState {
	rooms: MeetRoom[];
	nextPageToken?: string;
	hasMore: boolean;
	filters: RoomTableFilter;
	scrollTop: number;
}

@Component({
	selector: 'ov-rooms',
	imports: [
		MatListModule,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		RouterModule,
		MatTableModule,
		MatMenuModule,
		MatTooltipModule,
		MatDividerModule,
		MatSortModule,
		MatPaginatorModule,
		MatProgressSpinnerModule,
		MatFormFieldModule,
		MatInputModule,
		RoomsListsComponent,
		ScrollPersistDirective,
		TranslatePipe
	],
	templateUrl: './rooms.component.html',
	styleUrl: './rooms.component.scss'
})
export class RoomsComponent implements OnInit, OnDestroy {
	private roomService = inject(RoomService);
	private listStateCache = inject(ListStateCacheService);
	private authService = inject(AuthService);
	private notificationService = inject(NotificationService);
	private dialogPresetsService = inject(DialogPresetsService);
	private readonly translateService = inject(TranslateService);
	protected navigationService = inject(NavigationService);
	protected roomDeletionService = inject(RoomDeletionService);
	private dialog = inject(MatDialog);
	protected loggerService = inject(LoggerService);
	protected log: ILogger = this.loggerService.get('OpenVidu Meet - RoomsComponent');

	private static readonly STATE_KEY = 'rooms';

	private readonly scroller = viewChild(ScrollPersistDirective);
	/** Scroll position to restore on the page container (set when restoring cached state). */
	protected scrollToRestore = 0;

	rooms = signal<MeetRoom[]>([]);
	currentUserId = signal<string>('');
	currentUserRole = signal<MeetUserRole | undefined>(undefined);
	protected readonly MeetUserRole = MeetUserRole;

	// Loading state
	isInitializing = signal(true);
	showInitialLoader = signal(false);
	isLoading = signal(false);

	initialFilters = signal<RoomTableFilter>({
		nameFilter: '',
		nameMatchMode: TextMatchMode.PREFIX,
		nameCaseInsensitive: false,
		statusFilter: '',
		sortField: 'creationDate',
		sortOrder: SortOrder.DESC,
		ownerFilter: '',
		memberFilter: '',
		showOwnedRooms: false,
		showMemberRooms: false,
		showUserAccessRooms: false
	});

	// Pagination
	hasMoreRooms = signal(false);
	private nextPageToken?: string;

	// Track current active filters so deletions can trigger auto-load
	private currentFilters: RoomTableFilter = this.initialFilters();

	async ngOnInit() {
		// Capture the navigation trigger synchronously, before any await finalizes the navigation.
		const isBackNavigation = this.navigationService.isPopStateNavigation();

		const [userId, role] = await Promise.all([this.authService.getUserId(), this.authService.getUserRole()]);
		this.currentUserId.set(userId ?? '');
		this.currentUserRole.set(role);

		// Restore previously cached state (filters, sort, loaded pages, scroll) only when
		// navigating *back* (browser back/forward). An explicit navigation to this page
		// (clicking the menu/link) loads fresh data so changes by others are reflected.
		const cached = this.listStateCache.get<RoomsListCachedState>(RoomsComponent.STATE_KEY);
		if (cached && isBackNavigation) {
			this.rooms.set(cached.rooms);
			this.nextPageToken = cached.nextPageToken;
			this.hasMoreRooms.set(cached.hasMore);
			this.currentFilters = cached.filters;
			this.initialFilters.set(cached.filters); // seeds the child filter form via setupFilters()
			this.scrollToRestore = cached.scrollTop; // applied by ScrollPersistDirective once rendered
			this.isInitializing.set(false);
			return;
		}

		const delayLoader = setTimeout(() => {
			this.showInitialLoader.set(true);
		}, 200);

		await this.loadRooms(this.initialFilters());

		clearTimeout(delayLoader);
		this.showInitialLoader.set(false);
		this.isInitializing.set(false);
	}

	ngOnDestroy() {
		this.listStateCache.set<RoomsListCachedState>(RoomsComponent.STATE_KEY, {
			rooms: this.rooms(),
			nextPageToken: this.nextPageToken,
			hasMore: this.hasMoreRooms(),
			filters: this.currentFilters,
			scrollTop: this.scroller()?.scrollTop ?? 0
		});
	}

	async onRoomAction(action: RoomTableAction) {
		switch (action.action) {
			case 'create':
				await this.createRoom();
				break;
			case 'access':
				this.accessRoom(action.rooms[0]);
				break;
			case 'edit':
				await this.editRoomConfig(action.rooms[0]);
				break;
			case 'shareLink':
				this.shareLink(action.rooms[0]);
				break;
			case 'reopen':
				this.reopenRoom(action.rooms[0]);
				break;
			case 'close':
				this.closeRoom(action.rooms[0]);
				break;
			case 'delete':
				this.deleteRoom(action.rooms[0]);
				break;
			case 'bulkDelete':
				this.bulkDeleteRooms(action.rooms);
				break;
		}
	}

	private async autoLoadIfEmpty() {
		if (this.rooms().length === 0 && this.hasMoreRooms()) {
			await this.loadRooms(this.currentFilters);
		}
	}

	private async loadRooms(filters: RoomTableFilter, refresh = false) {
		this.currentFilters = filters;
		const delayLoader = setTimeout(() => {
			this.isLoading.set(true);
		}, 200);

		try {
			const roomFilters: MeetRoomFilters = {
				maxItems: 50,
				nextPageToken: !refresh ? this.nextPageToken : undefined,
				sortField: filters.sortField,
				sortOrder: filters.sortOrder
			};

			// Apply room name filter if provided
			if (filters.nameFilter) {
				roomFilters.roomName = filters.nameFilter;
				roomFilters.roomNameMatchMode = filters.nameMatchMode;
				roomFilters.roomNameCaseInsensitive = filters.nameCaseInsensitive || undefined;
			}

			// Apply status filter if provided
			if (filters.statusFilter) {
				roomFilters.status = filters.statusFilter as MeetRoomStatus;
			}

			// Apply access-scope filters based on user role
			const role = this.currentUserRole();
			const userId = this.currentUserId();

			if (role === MeetUserRole.ADMIN) {
				// For ADMIN: direct filter pass-through — results are narrowed to rooms matching any selected criterion
				if (filters.ownerFilter) roomFilters.owner = filters.ownerFilter;
				if (filters.memberFilter) roomFilters.member = filters.memberFilter;
				if (filters.showUserAccessRooms) roomFilters.userAccess = true;
			} else if (userId) {
				// For ROOM_MANAGER/ROOM_MEMBER: scope selectors bound to the current user's identity
				if (filters.showOwnedRooms) roomFilters.owner = userId;
				if (filters.showMemberRooms) roomFilters.member = userId;
				if (filters.showUserAccessRooms) roomFilters.userAccess = true;
			}

			const response = await this.roomService.listRooms(roomFilters);
			const rooms = response.rooms;

			if (!refresh) {
				// Update rooms list
				const currentRooms = this.rooms();
				this.rooms.set([...currentRooms, ...rooms]);
			} else {
				// Replace rooms list
				this.rooms.set(rooms);
			}

			// Update pagination
			this.nextPageToken = response.pagination.nextPageToken;
			this.hasMoreRooms.set(response.pagination.isTruncated);
		} catch (error) {
			this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.LOADING_ROOMS'));
			this.log.e('Error loading rooms:', error);
		} finally {
			clearTimeout(delayLoader);
			this.isLoading.set(false);
		}
	}

	async loadMoreRooms(filters: RoomTableFilter) {
		if (!this.hasMoreRooms() || this.isLoading()) return;
		await this.loadRooms(filters);
	}

	async refreshRooms(filters: RoomTableFilter) {
		this.nextPageToken = undefined;
		await this.loadRooms(filters, true);
	}

	private async createRoom() {
		try {
			await this.navigationService.navigateTo('/rooms/new');
		} catch (error) {
			this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.CREATING_ROOM'));
			this.log.e('Error creating room:', error);
			return;
		}
	}

	private accessRoom({ access }: MeetRoom) {
		window.open(access.user.url, '_blank');
	}

	private async editRoomConfig(room: MeetRoom) {
		try {
			await this.navigationService.navigateTo(`/rooms/${room.roomId}/edit`);
		} catch (error) {
			this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.NAVIGATING_ROOM_CONFIG'));
			this.log.e('Error navigating to room config:', error);
		}
	}

	private shareLink(room: MeetRoom) {
		const canManageRoom = RoomUiUtils.canManageRoom(room, this.currentUserId(), this.currentUserRole());
		this.dialog.open(RoomShareDialogComponent, {
			width: '450px',
			data: { access: room.access, roomId: room.roomId, canManageRoom },
			panelClass: 'ov-meet-dialog'
		});
	}

	async onRoomClick(roomId: string) {
		try {
			await this.navigationService.navigateTo(`/rooms/${roomId}`);
		} catch (error) {
			this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.NAVIGATING_ROOM_DETAIL'));
			this.log.e('Error navigating to room detail:', error);
		}
	}

	private async reopenRoom(room: MeetRoom) {
		try {
			const updatedRoom = await this.roomService.updateRoomStatus(room.roomId, MeetRoomStatus.OPEN);

			// Update room in the list
			this.rooms.set(this.rooms().map((r) => (r.roomId === updatedRoom.roomId ? updatedRoom : r)));
			this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.ROOM_REOPENED'));
		} catch (error) {
			this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.FAILED_REOPEN_ROOM'));
			this.log.e('Error reopening room:', error);
		}
	}

	private async closeRoom(room: MeetRoom) {
		try {
			const updatedRoom = await this.roomService.updateRoomStatus(room.roomId, MeetRoomStatus.CLOSED);

			// Update room in the list
			this.rooms.set(this.rooms().map((r) => (r.roomId === updatedRoom.roomId ? updatedRoom : r)));

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

	private deleteRoom({ roomId }: MeetRoom) {
		this.roomDeletionService.deleteRoomWithConfirmation({
			roomId,
			log: this.log,
			onSuccess: async ({ room: updatedRoom, successCode, message }) => {
				await this.handleSuccessfulDeletion(roomId, successCode, message, updatedRoom);
			}
		});
	}

	private async handleSuccessfulDeletion(
		roomId: string,
		successCode: MeetRoomDeletionSuccessCode,
		message: string,
		updatedRoom?: MeetRoom
	) {
		if (updatedRoom) {
			// Room was not deleted, but updated (e.g., scheduled for deletion)
			if (successCode === MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_CLOSED) {
				updatedRoom.status = MeetRoomStatus.CLOSED;
			}

			this.rooms.set(this.rooms().map((r) => (r.roomId === updatedRoom.roomId ? updatedRoom : r)));
		} else {
			// Room was deleted, remove from list
			this.rooms.set(this.rooms().filter((r) => r.roomId !== roomId));
			await this.autoLoadIfEmpty();
		}

		this.notificationService.showSnackbar(this.roomDeletionService.removeRoomIdFromMessage(message));
	}

	private bulkDeleteRooms(rooms: MeetRoom[]) {
		const bulkDeleteCallback = async () => {
			try {
				const roomIds = rooms.map((r) => r.roomId);
				const { message, deleted } = await this.roomService.bulkDeleteRooms(
					roomIds,
					MeetRoomDeletionPolicyWithMeeting.FAIL,
					MeetRoomDeletionPolicyWithRecordings.FAIL
				);

				this.handleSuccessfulBulkDeletion(deleted);
				this.notificationService.showSnackbar(message);
				await this.autoLoadIfEmpty();
			} catch (error: any) {
				// Check if it's a structured error with failed rooms
				const failed = error.error?.failed as { roomId: string; error: string; message: string }[];
				const deleted = error.error?.deleted;
				const errorMessage = error.error?.message;

				if (failed) {
					this.handleSuccessfulBulkDeletion(deleted);
					await this.autoLoadIfEmpty();

					const hasRoomDeletionError = failed.some((result) =>
						this.roomDeletionService.isValidDeletionErrorCode(result.error)
					);
					if (hasRoomDeletionError) {
						this.showBulkDeletionErrorDialogWithOptions(failed, errorMessage);
					} else {
						this.notificationService.showSnackbar(errorMessage);
						this.log.e('Error in bulk delete:', failed);
					}
				} else {
					this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.FAILED_DELETE_ROOMS'));
					this.log.e('Error in bulk delete:', error);
				}
			}
		};

		this.notificationService.showDialog({
			...this.dialogPresetsService.getBulkDeleteRoomsDialogPreset(rooms.length),
			confirmCallback: bulkDeleteCallback
		});
	}

	private handleSuccessfulBulkDeletion(
		successResults: {
			roomId: string;
			successCode: MeetRoomDeletionSuccessCode;
			message: string;
			room?: MeetRoom;
		}[]
	) {
		const currentRooms = this.rooms();
		let updatedRooms = [...currentRooms];
		const deletedRoomIds: string[] = [];

		// Process each successful result
		successResults.forEach(({ roomId, successCode, room: updatedRoom }) => {
			if (updatedRoom) {
				// Room was not deleted, but updated (e.g., scheduled for deletion, closed)
				if (successCode === MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_CLOSED) {
					updatedRoom.status = MeetRoomStatus.CLOSED;
				}

				// Update the room in the array
				updatedRooms = updatedRooms.map((r) => (r.roomId === updatedRoom.roomId ? updatedRoom : r));
			} else {
				// Room was deleted, mark for removal from list
				deletedRoomIds.push(roomId);
			}
		});

		// Remove deleted rooms from the array
		if (deletedRoomIds.length > 0) {
			updatedRooms = updatedRooms.filter((r) => !deletedRoomIds.includes(r.roomId));
		}

		// Update the rooms signal with all changes
		this.rooms.set(updatedRooms);
	}

	private showBulkDeletionErrorDialogWithOptions(
		failedResults: {
			roomId: string;
			error: string;
			message: string;
		}[],
		errorMessage: string
	) {
		const roomIds = failedResults.map((r) => r.roomId);

		const bulkDeleteWithPoliciesCallback = async (
			meetingPolicy: MeetRoomDeletionPolicyWithMeeting,
			recordingPolicy: MeetRoomDeletionPolicyWithRecordings
		) => {
			try {
				const { message, deleted } = await this.roomService.bulkDeleteRooms(
					roomIds,
					meetingPolicy,
					recordingPolicy
				);

				this.handleSuccessfulBulkDeletion(deleted);
				this.notificationService.showSnackbar(message);
				await this.autoLoadIfEmpty();
			} catch (error: any) {
				this.log.e('Error in second bulk deletion attempt:', error);

				// Check if it fails again with structured error
				const failed = error.error?.failed;
				const deleted = error.error?.deleted;
				const message = error.error?.message;

				if (failed && deleted) {
					this.handleSuccessfulBulkDeletion(deleted);
					this.notificationService.showSnackbar(message);
					await this.autoLoadIfEmpty();
				} else {
					this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.FAILED_DELETE_ROOMS'));
				}
			}
		};

		const dialogOptions: DeleteRoomDialogOptions = {
			title: this.translateService.translate('ROOMS.ERRORS.ERROR_DELETING_ROOMS'),
			message: `${errorMessage}. They have active meetings and/or recordings:
			<p>${roomIds.join(', ')}</p>`,
			confirmText: this.translateService.translate('ROOMS.ERRORS.DELETE_WITH_OPTIONS'),
			showWithMeetingPolicy: true,
			showWithRecordingsPolicy: true,
			confirmCallback: bulkDeleteWithPoliciesCallback
		};
		this.dialog.open(DeleteRoomDialogComponent, {
			data: dialogOptions,
			disableClose: true
		});
	}
}
