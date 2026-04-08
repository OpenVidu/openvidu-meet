import { Clipboard } from '@angular/cdk/clipboard';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
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
	SortOrder
} from '@openvidu-meet/typings';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';

import { DeleteRoomDialogOptions } from '../../../../shared/models/notification.model';
import { DeleteRoomDialogComponent } from '../../components/delete-room-dialog/delete-room-dialog.component';
import {
	RoomsListsComponent,
	RoomTableAction,
	RoomTableFilter
} from '../../components/rooms-lists/rooms-lists.component';
import { RoomDeletionService } from '../../services/room-deletion.service';
import { RoomService } from '../../services/room.service';

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
		RoomsListsComponent
	],
	templateUrl: './rooms.component.html',
	styleUrl: './rooms.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomsComponent implements OnInit {
	rooms = signal<MeetRoom[]>([]);

	// Loading state
	isInitializing = signal(true);
	showInitialLoader = signal(false);
	isLoading = signal(false);

	initialFilters = signal<RoomTableFilter>({
		nameFilter: '',
		statusFilter: '',
		sortField: 'creationDate',
		sortOrder: SortOrder.DESC
	});

	// Pagination
	hasMoreRooms = signal(false);
	private nextPageToken?: string;

	protected log: ILogger;
	protected loggerService = inject(LoggerService);
	private roomService = inject(RoomService);
	private notificationService = inject(NotificationService);
	protected navigationService = inject(NavigationService);
	protected roomDeletionService = inject(RoomDeletionService);
	private clipboard = inject(Clipboard);
	private dialog = inject(MatDialog);

	constructor() {
		this.log = this.loggerService.get('OpenVidu Meet - RoomService');
	}

	async ngOnInit() {
		const delayLoader = setTimeout(() => {
			this.showInitialLoader.set(true);
		}, 200);

		await this.loadRooms(this.initialFilters());

		clearTimeout(delayLoader);
		this.showInitialLoader.set(false);
		this.isInitializing.set(false);
	}

	async onRoomAction(action: RoomTableAction) {
		switch (action.action) {
			case 'create':
				await this.createRoom();
				break;
			case 'open':
				this.openRoom(action.rooms[0]);
				break;
			case 'edit':
				await this.editRoomConfig(action.rooms[0]);
				break;
			case 'copyModeratorLink':
				this.copyModeratorLink(action.rooms[0]);
				break;
			case 'copySpeakerLink':
				this.copySpeakerLink(action.rooms[0]);
				break;
			case 'viewRecordings':
				await this.viewRecordings(action.rooms[0]);
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

	private async loadRooms(filters: RoomTableFilter, refresh = false) {
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

			// Apply room ID filter if provided
			if (filters.nameFilter) {
				roomFilters.roomName = filters.nameFilter;
			}

			// Apply status filter if provided
			if (filters.statusFilter) {
				roomFilters.status = filters.statusFilter as MeetRoomStatus;
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
			this.notificationService.showSnackbar('Error loading rooms');
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
			this.notificationService.showSnackbar('Error creating room');
			this.log.e('Error creating room:', error);
			return;
		}
	}

	private openRoom({ access }: MeetRoom) {
		window.open(access.registered.url, '_blank');
	}

	private async editRoomConfig(room: MeetRoom) {
		try {
			await this.navigationService.navigateTo(`/rooms/${room.roomId}/edit`);
		} catch (error) {
			this.notificationService.showSnackbar('Error navigating to room config');
			this.log.e('Error navigating to room config:', error);
		}
	}

	private copyModeratorLink({ access }: MeetRoom) {
		this.clipboard.copy(access.anonymous.moderator.url);
		this.notificationService.showSnackbar('Moderator link copied to clipboard');
	}

	private copySpeakerLink({ access }: MeetRoom) {
		this.clipboard.copy(access.anonymous.speaker.url);
		this.notificationService.showSnackbar('Speaker link copied to clipboard');
	}

	private async viewRecordings(room: MeetRoom) {
		// Navigate to recordings page for this room
		try {
			await this.navigationService.navigateTo('/recordings', { 'roomId': room.roomId });
		} catch (error) {
			this.notificationService.showSnackbar('Error navigating to recordings');
			this.log.e('Error navigating to recordings:', error);
		}
	}

	async onRoomClick(roomId: string) {
		try {
			await this.navigationService.navigateTo(`/rooms/${roomId}`);
		} catch (error) {
			this.notificationService.showSnackbar('Error navigating to room detail');
			this.log.e('Error navigating to room detail:', error);
		}
	}

	private async reopenRoom(room: MeetRoom) {
		try {
			const { room: updatedRoom } = await this.roomService.updateRoomStatus(room.roomId, MeetRoomStatus.OPEN);

			// Update room in the list
			this.rooms.set(this.rooms().map((r) => (r.roomId === updatedRoom.roomId ? updatedRoom : r)));
			this.notificationService.showSnackbar('Room reopened successfully');
		} catch (error) {
			this.notificationService.showSnackbar('Failed to reopen room');
			this.log.e('Error reopening room:', error);
		}
	}

	private async closeRoom(room: MeetRoom) {
		try {
			const { message, room: updatedRoom } = await this.roomService.updateRoomStatus(
				room.roomId,
				MeetRoomStatus.CLOSED
			);

			// Update room in the list
			this.rooms.set(this.rooms().map((r) => (r.roomId === updatedRoom.roomId ? updatedRoom : r)));
			this.notificationService.showSnackbar(this.roomDeletionService.removeRoomIdFromMessage(message));
		} catch (error) {
			this.notificationService.showSnackbar('Failed to close room');
			this.log.e('Error closing room:', error);
		}
	}

	private deleteRoom({ roomId }: MeetRoom) {
		this.roomDeletionService.deleteRoomWithConfirmation({
			roomId,
			log: this.log,
			onSuccess: ({ room: updatedRoom, successCode, message }) => {
				this.handleSuccessfulDeletion(roomId, successCode, message, updatedRoom);
			}
		});
	}

	private handleSuccessfulDeletion(
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
		}

		this.notificationService.showSnackbar(this.roomDeletionService.removeRoomIdFromMessage(message));
	}

	private bulkDeleteRooms(rooms: MeetRoom[]) {
		const bulkDeleteCallback = async () => {
			try {
				const roomIds = rooms.map((r) => r.roomId);
				const { message, successful } = await this.roomService.bulkDeleteRooms(
					roomIds,
					MeetRoomDeletionPolicyWithMeeting.FAIL,
					MeetRoomDeletionPolicyWithRecordings.FAIL
				);

				this.handleSuccessfulBulkDeletion(successful);
				this.notificationService.showSnackbar(message);
			} catch (error: any) {
				// Check if it's a structured error with failed rooms
				const failed = error.error?.failed as { roomId: string; error: string; message: string }[];
				const successful = error.error?.successful;
				const errorMessage = error.error?.message;

				if (failed) {
					this.handleSuccessfulBulkDeletion(successful);

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
					this.notificationService.showSnackbar('Failed to delete rooms');
					this.log.e('Error in bulk delete:', error);
				}
			}
		};

		this.notificationService.showDialog({
			title: 'Delete Rooms',
			icon: 'delete_outline',
			message: `Are you sure you want to delete <b>${rooms.length}</b> rooms?`,
			confirmText: 'Delete all',
			cancelText: 'Cancel',
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
				const { message, successful } = await this.roomService.bulkDeleteRooms(
					roomIds,
					meetingPolicy,
					recordingPolicy
				);

				this.handleSuccessfulBulkDeletion(successful);
				this.notificationService.showSnackbar(message);
			} catch (error: any) {
				this.log.e('Error in second bulk deletion attempt:', error);

				// Check if it fails again with structured error
				const failed = error.error?.failed;
				const successful = error.error?.successful;
				const message = error.error?.message;

				if (failed && successful) {
					this.handleSuccessfulBulkDeletion(successful);
					this.notificationService.showSnackbar(message);
				} else {
					this.notificationService.showSnackbar('Failed to delete rooms');
				}
			}
		};

		const dialogOptions: DeleteRoomDialogOptions = {
			title: 'Error Deleting Rooms',
			message: `${errorMessage}. They have active meetings and/or recordings:
			<p>${roomIds.join(', ')}</p>`,
			confirmText: 'Delete with Options',
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
