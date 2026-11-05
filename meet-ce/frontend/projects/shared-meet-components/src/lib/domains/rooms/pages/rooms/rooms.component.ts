import { Component, inject, OnInit, signal } from '@angular/core';
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
	MeetUserRole
} from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { bulkDeleteRoomsDialogPreset } from '../../utils/dialog-presets';
import { EntityListState } from '../../../../shared/models/entity-list.model';
import { ListUrlState } from '../../../../shared/models/list-url-state';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { DialogService } from '../../../../shared/services/dialog.service';
import { NotificationService } from '../../../../shared/services/notification.service';

import { DeleteRoomDialogOptions } from '../../models/delete-room-dialog.model';
import { DeleteRoomDialogComponent } from '../../components/delete-room-dialog/delete-room-dialog.component';
import { RoomShareDialogComponent } from '../../components/room-share-dialog/room-share-dialog.component';
import {
	ROOM_FILTER_DEFAULTS,
	ROOM_FILTER_URL_PARAMS,
	RoomsListsComponent,
	RoomTableAction,
	RoomTableFilter
} from '../../components/rooms-lists/rooms-lists.component';
import { RoomDeletionService } from '../../services/room-deletion.service';
import { RoomService } from '../../services/room.service';
import { RoomUiUtils } from '../../utils/ui';
import { AuthService } from '../../../auth/services/auth.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import type { ILogger } from '../../../../shared/models/logger.model';

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
		TranslatePipe
	],
	templateUrl: './rooms.component.html',
	styleUrl: './rooms.component.scss'
})
export class RoomsComponent implements OnInit {
	private roomService = inject(RoomService);
	private authService = inject(AuthService);
	private notificationService = inject(NotificationService);
	private dialogService = inject(DialogService);
	private readonly translateService = inject(TranslateService);
	protected navigationService = inject(NavigationService);
	protected roomDeletionService = inject(RoomDeletionService);
	private dialog = inject(MatDialog);
	protected loggerService = inject(LoggerService);
	protected log: ILogger = this.loggerService.get('OpenVidu Meet - RoomsComponent');

	currentUserId = signal<string>('');
	currentUserRole = signal<MeetUserRole | undefined>(undefined);
	protected readonly MeetUserRole = MeetUserRole;

	protected readonly urlState = new ListUrlState(ROOM_FILTER_DEFAULTS, ROOM_FILTER_URL_PARAMS);
	initialFilters = signal(this.urlState.current);

	protected readonly list = new EntityListState<MeetRoom, RoomTableFilter>({
		initialFilters: this.initialFilters(),
		fetchPage: (filters, nextPageToken) => this.fetchRoomsPage(filters, nextPageToken),
		onLoadError: (error) => {
			this.notificationService.showMessage(this.translateService.translate('ROOMS.ERRORS.LOADING_ROOMS'));
			this.log.e('Error loading rooms:', error);
		}
	});

	async ngOnInit() {
		const [userId, role] = await Promise.all([this.authService.getUserId(), this.authService.getUserRole()]);
		this.currentUserId.set(userId ?? '');
		this.currentUserRole.set(role);

		await this.list.initialize(this.initialFilters());
		this.urlState.onChange((filters) => {
			this.initialFilters.set(filters);
			void this.list.refresh(filters);
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

	private async fetchRoomsPage(filters: RoomTableFilter, nextPageToken: string | undefined) {
		const roomFilters: MeetRoomFilters = {
			maxItems: 50,
			nextPageToken,
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

		return {
			items: response.rooms,
			nextPageToken: response.pagination.nextPageToken,
			hasMore: response.pagination.isTruncated
		};
	}

	private async createRoom() {
		try {
			await this.navigationService.navigateTo('/rooms/new');
		} catch (error) {
			this.notificationService.showMessage(this.translateService.translate('ROOMS.ERRORS.CREATING_ROOM'));
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
			this.notificationService.showMessage(
				this.translateService.translate('ROOMS.ERRORS.NAVIGATING_ROOM_CONFIG')
			);
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

	private async reopenRoom(room: MeetRoom) {
		try {
			const updatedRoom = await this.roomService.updateRoomStatus(room.roomId, MeetRoomStatus.OPEN);

			// Update room in the list
			this.list.update((rooms) => rooms.map((r) => (r.roomId === updatedRoom.roomId ? updatedRoom : r)));
			this.notificationService.showMessage(this.translateService.translate('ROOMS.ERRORS.ROOM_REOPENED'));
		} catch (error) {
			this.notificationService.showMessage(this.translateService.translate('ROOMS.ERRORS.FAILED_REOPEN_ROOM'));
			this.log.e('Error reopening room:', error);
		}
	}

	private async closeRoom(room: MeetRoom) {
		try {
			const updatedRoom = await this.roomService.updateRoomStatus(room.roomId, MeetRoomStatus.CLOSED);

			// Update room in the list
			this.list.update((rooms) => rooms.map((r) => (r.roomId === updatedRoom.roomId ? updatedRoom : r)));

			// The close is applied immediately unless a meeting is still active, in which case
			// it is scheduled to take effect when the meeting ends.
			const message =
				updatedRoom.status === MeetRoomStatus.CLOSED
					? this.translateService.translate('ROOMS.ERRORS.ROOM_CLOSED')
					: this.translateService.translate('ROOMS.ERRORS.ROOM_SCHEDULED_CLOSE');
			this.notificationService.showMessage(message);
		} catch (error) {
			this.notificationService.showMessage(this.translateService.translate('ROOMS.ERRORS.FAILED_CLOSE_ROOM'));
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

			this.list.update((rooms) => rooms.map((r) => (r.roomId === updatedRoom.roomId ? updatedRoom : r)));
		} else {
			// Room was deleted, remove from list
			this.list.remove((r) => r.roomId === roomId);
			await this.list.autoLoadIfEmpty();
		}

		this.notificationService.showMessage(message);
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
				this.notificationService.showMessage(message);
				await this.list.autoLoadIfEmpty();
			} catch (error: any) {
				// Check if it's a structured error with failed rooms
				const failed = error.error?.failed as { roomId: string; error: string; message: string }[];
				const deleted = error.error?.deleted;
				const errorMessage = error.error?.message;

				if (failed) {
					this.handleSuccessfulBulkDeletion(deleted);
					await this.list.autoLoadIfEmpty();

					const hasRoomDeletionError = failed.some((result) =>
						this.roomDeletionService.isValidDeletionErrorCode(result.error)
					);

					if (hasRoomDeletionError) {
						this.showBulkDeletionErrorDialogWithOptions(failed, errorMessage);
					} else {
						this.notificationService.showMessage(errorMessage);
						this.log.e('Error in bulk delete:', failed);
					}
				} else {
					this.notificationService.showMessage(
						this.translateService.translate('ROOMS.ERRORS.FAILED_DELETE_ROOMS')
					);
					this.log.e('Error in bulk delete:', error);
				}
			}
		};

		this.dialogService.showDialog({
			...bulkDeleteRoomsDialogPreset(this.translateService, rooms.length),
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
		this.list.update((currentRooms) => {
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

			return updatedRooms;
		});
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
				this.notificationService.showMessage(message);
				await this.list.autoLoadIfEmpty();
			} catch (error: any) {
				this.log.e('Error in second bulk deletion attempt:', error);

				// Check if it fails again with structured error
				const failed = error.error?.failed;
				const deleted = error.error?.deleted;
				const message = error.error?.message;

				if (failed && deleted) {
					this.handleSuccessfulBulkDeletion(deleted);
					this.notificationService.showMessage(message);
					await this.list.autoLoadIfEmpty();
				} else {
					this.notificationService.showMessage(
						this.translateService.translate('ROOMS.ERRORS.FAILED_DELETE_ROOMS')
					);
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
