import { Clipboard } from '@angular/cdk/clipboard';
import { Component, OnInit, signal } from '@angular/core';
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
	MeetRoomDeletionErrorCode,
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
	styleUrl: './rooms.component.scss'
})
export class RoomsComponent implements OnInit {
	rooms = signal<MeetRoom[]>([]);

	// Loading state
	isInitializing = true;
	showInitialLoader = false;
	isLoading = false;

	initialFilters = signal<RoomTableFilter>({
		nameFilter: '',
		statusFilter: '',
		sortField: 'creationDate',
		sortOrder: SortOrder.DESC
	});

	// Pagination
	hasMoreRooms = false;
	private nextPageToken?: string;

	protected log: ILogger;

	constructor(
		protected loggerService: LoggerService,
		private roomService: RoomService,
		private notificationService: NotificationService,
		protected navigationService: NavigationService,
		private clipboard: Clipboard,
		private dialog: MatDialog
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomService');
	}

	async ngOnInit() {
		const delayLoader = setTimeout(() => {
			this.showInitialLoader = true;
		}, 200);

		await this.loadRooms(this.initialFilters());

		clearTimeout(delayLoader);
		this.showInitialLoader = false;
		this.isInitializing = false;
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
			this.isLoading = true;
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
			this.hasMoreRooms = response.pagination.isTruncated;
		} catch (error) {
			this.notificationService.showSnackbar('Error loading rooms');
			this.log.e('Error loading rooms:', error);
		} finally {
			clearTimeout(delayLoader);
			this.isLoading = false;
		}
	}

	async loadMoreRooms(filters: RoomTableFilter) {
		if (!this.hasMoreRooms || this.isLoading) return;
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

	private openRoom({ accessUrl }: MeetRoom) {
		window.open(accessUrl, '_blank');
	}

	private async editRoomConfig(room: MeetRoom) {
		try {
			await this.navigationService.navigateTo(`/rooms/${room.roomId}/edit`);
		} catch (error) {
			this.notificationService.showSnackbar('Error navigating to room config');
			this.log.e('Error navigating to room config:', error);
		}
	}

	private copyModeratorLink({ anonymous }: MeetRoom) {
		this.clipboard.copy(anonymous.moderator.accessUrl);
		this.notificationService.showSnackbar('Moderator link copied to clipboard');
	}

	private copySpeakerLink({ anonymous }: MeetRoom) {
		this.clipboard.copy(anonymous.speaker.accessUrl);
		this.notificationService.showSnackbar('Speaker link copied to clipboard');
	}

	private async viewRecordings(room: MeetRoom) {
		// Navigate to recordings page for this room
		try {
			await this.navigationService.navigateTo('/recordings', { 'room-id': room.roomId });
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
			this.notificationService.showSnackbar(this.removeRoomIdFromMessage(message));
		} catch (error) {
			this.notificationService.showSnackbar('Failed to close room');
			this.log.e('Error closing room:', error);
		}
	}

	private deleteRoom({ roomId }: MeetRoom) {
		const deleteCallback = async () => {
			try {
				const {
					successCode,
					message,
					room: updatedRoom
				} = await this.roomService.deleteRoom(
					roomId,
					MeetRoomDeletionPolicyWithMeeting.FAIL,
					MeetRoomDeletionPolicyWithRecordings.FAIL
				);
				this.handleSuccessfulDeletion(roomId, successCode, message, updatedRoom);
			} catch (error: any) {
				// Check if errorCode exists and is a valid MeetRoomDeletionErrorCode
				const errorCode = error.error?.error;
				if (errorCode && this.isValidMeetRoomDeletionErrorCode(errorCode)) {
					const errorMessage = this.removeRoomIdFromMessage(error.error.message);
					this.showDeletionErrorDialogWithOptions(roomId, errorMessage);
				} else {
					this.notificationService.showSnackbar('Failed to delete room');
					this.log.e('Error deleting room:', error);
					return;
				}
			}
		};

		this.notificationService.showDialog({
			title: 'Delete Room',
			icon: 'delete_outline',
			message: `Are you sure you want to delete the room <b>${roomId}</b>?`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			confirmCallback: deleteCallback
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

		this.notificationService.showSnackbar(this.removeRoomIdFromMessage(message));
	}

	private showDeletionErrorDialogWithOptions(roomId: string, errorMessage: string) {
		const deleteWithPoliciesCallback = async (
			meetingPolicy: MeetRoomDeletionPolicyWithMeeting,
			recordingPolicy: MeetRoomDeletionPolicyWithRecordings
		) => {
			try {
				const {
					successCode,
					message,
					room: updatedRoom
				} = await this.roomService.deleteRoom(roomId, meetingPolicy, recordingPolicy);
				this.handleSuccessfulDeletion(roomId, successCode, message, updatedRoom);
			} catch (error) {
				// If it fails again, just show a snackbar
				this.notificationService.showSnackbar('Failed to delete room');
				this.log.e('Error in second deletion attempt:', error);
			}
		};

		const dialogOptions: DeleteRoomDialogOptions = {
			title: 'Error Deleting Room',
			message: errorMessage,
			confirmText: 'Delete with Options',
			showWithMeetingPolicy: true,
			showWithRecordingsPolicy: true,
			confirmCallback: deleteWithPoliciesCallback
		};
		this.dialog.open(DeleteRoomDialogComponent, {
			data: dialogOptions,
			disableClose: true
		});
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
						this.isValidMeetRoomDeletionErrorCode(result.error)
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

	private isValidMeetRoomDeletionErrorCode(errorCode: string): boolean {
		const validErrorCodes = [
			MeetRoomDeletionErrorCode.ROOM_HAS_ACTIVE_MEETING,
			MeetRoomDeletionErrorCode.ROOM_HAS_RECORDINGS,
			MeetRoomDeletionErrorCode.ROOM_WITH_ACTIVE_MEETING_HAS_RECORDINGS,
			MeetRoomDeletionErrorCode.ROOM_WITH_ACTIVE_MEETING_HAS_RECORDINGS_CANNOT_SCHEDULE_DELETION,
			MeetRoomDeletionErrorCode.ROOM_WITH_RECORDINGS_HAS_ACTIVE_MEETING
		];
		return validErrorCodes.includes(errorCode as MeetRoomDeletionErrorCode);
	}

	/**
	 * Removes the room ID from API response messages to create generic messages.
	 *
	 * @param message - The original message from the API response
	 * @returns The message without the specific room ID
	 */
	private removeRoomIdFromMessage(message: string): string {
		// Pattern to match room ID in single quotes: 'room-id'
		const roomIdPattern = /'[^']+'/g;
		let filteredMessage = message.replace(roomIdPattern, '');

		// Clean up any double spaces that might result from the replacement
		filteredMessage = filteredMessage.replace(/\s+/g, ' ').trim();
		return filteredMessage;
	}
}
