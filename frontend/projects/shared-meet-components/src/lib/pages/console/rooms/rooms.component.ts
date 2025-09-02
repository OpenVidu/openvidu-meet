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
import { RoomsListsComponent, RoomTableAction } from '@lib/components';
import { DeleteRoomDialogComponent } from '@lib/components/dialogs/delete-room-dialog/delete-room-dialog.component';
import { DeleteRoomDialogOptions } from '@lib/models';
import { NavigationService, NotificationService, RoomService } from '@lib/services';
import {
	MeetRoom,
	MeetRoomDeletionErrorCode,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomDeletionSuccessCode,
	MeetRoomFilters,
	MeetRoomStatus
} from '@lib/typings/ce';
import { ILogger, LoggerService } from 'openvidu-components-angular';

@Component({
	selector: 'ov-room-preferences',
	standalone: true,
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
	// @ViewChild(MatSort) sort!: MatSort;
	// @ViewChild(MatPaginator) paginator!: MatPaginator;
	// dataSource = new MatTableDataSource<MeetRoom>([]);
	// searchTerm = '';

	rooms = signal<MeetRoom[]>([]);

	// Loading state
	isInitializing = true;
	showInitialLoader = false;
	isLoading = false;

	initialFilters = {
		nameFilter: '',
		statusFilter: ''
	};

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

		await this.loadRooms();

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
				await this.editRoomPreferences(action.rooms[0]);
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

	private async loadRooms(filters?: { nameFilter: string; statusFilter: string }, refresh = false) {
		const delayLoader = setTimeout(() => {
			this.isLoading = true;
		}, 200);

		try {
			const roomFilters: MeetRoomFilters = {
				maxItems: 50,
				nextPageToken: !refresh ? this.nextPageToken : undefined
			};

			// Apply room ID filter if provided
			if (filters?.nameFilter) {
				roomFilters.roomName = filters.nameFilter;
			}

			const response = await this.roomService.listRooms(roomFilters);

			// TODO: Filter rooms by status

			if (!refresh) {
				// Update rooms list
				const currentRooms = this.rooms();
				this.rooms.set([...currentRooms, ...response.rooms]);
			} else {
				// Replace rooms list
				this.rooms.set(response.rooms);
			}

			// TODO: Sort rooms
			// this.dataSource.data = this.rooms();
			// this.setupTableFeatures();

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

	// private setupTableFeatures() {
	// 	// Setup sorting
	// 	this.dataSource.sort = this.sort;
	// 	this.dataSource.paginator = this.paginator;

	// 	// Custom sorting for dates and status
	// 	this.dataSource.sortingDataAccessor = (item, property) => {
	// 		switch (property) {
	// 			case 'creationDate':
	// 				return new Date(item.creationDate);
	// 			case 'status':
	// 				return item.markedForDeletion ? 1 : 0; // Active rooms first
	// 			case 'autoDeletion':
	// 				return item.autoDeletionDate ? new Date(item.autoDeletionDate) : new Date('9999-12-31'); // Rooms without auto-deletion go last
	// 			case 'roomName':
	// 				return item.roomId;
	// 			default:
	// 				return (item as any)[property];
	// 		}
	// 	};

	// 	// Custom filtering
	// 	this.dataSource.filterPredicate = (data: MeetRoom, filter: string) => {
	// 		const searchStr = filter.toLowerCase();
	// 		return (
	// 			data.roomId.toLowerCase().includes(searchStr) ||
	// 			data.roomName.toLowerCase().includes(searchStr) ||
	// 			false ||
	// 			(data.markedForDeletion ? 'inactive' : 'active').includes(searchStr)
	// 		);
	// 	};
	// }

	// applyFilter(event: Event) {
	// 	const filterValue = (event.target as HTMLInputElement).value;
	// 	this.searchTerm = filterValue;
	// 	this.dataSource.filter = filterValue.trim().toLowerCase();

	// 	if (this.dataSource.paginator) {
	// 		this.dataSource.paginator.firstPage();
	// 	}
	// }

	// clearFilter() {
	// 	this.searchTerm = '';
	// 	this.dataSource.filter = '';
	// 	if (this.dataSource.paginator) {
	// 		this.dataSource.paginator.firstPage();
	// 	}
	// }

	async loadMoreRooms(filters?: { nameFilter: string; statusFilter: string }) {
		if (!this.hasMoreRooms || this.isLoading) return;
		await this.loadRooms(filters);
	}

	async refreshRooms(filters?: { nameFilter: string; statusFilter: string }) {
		await this.loadRooms(filters, true);
	}

	private async createRoom() {
		try {
			await this.navigationService.navigateTo('rooms/new');
		} catch (error) {
			this.notificationService.showSnackbar('Error creating room');
			this.log.e('Error creating room:', error);
			return;
		}
	}

	private openRoom(room: MeetRoom) {
		window.open(room.moderatorUrl, '_blank');
	}

	private async editRoomPreferences(room: MeetRoom) {
		try {
			await this.navigationService.navigateTo(`rooms/${room.roomId}/edit`);
		} catch (error) {
			this.notificationService.showSnackbar('Error navigating to room preferences');
			this.log.e('Error navigating to room preferences:', error);
		}
	}

	private copyModeratorLink(room: MeetRoom) {
		this.clipboard.copy(room.moderatorUrl);
		this.notificationService.showSnackbar('Moderator link copied to clipboard');
	}

	private copySpeakerLink(room: MeetRoom) {
		this.clipboard.copy(room.speakerUrl);
		this.notificationService.showSnackbar('Speaker link copied to clipboard');
	}

	private async viewRecordings(room: MeetRoom) {
		// Navigate to recordings page for this room
		try {
			await this.navigationService.navigateTo('recordings', { 'room-id': room.roomId });
		} catch (error) {
			this.notificationService.showSnackbar('Error navigating to recordings');
			this.log.e('Error navigating to recordings:', error);
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
			const { statusCode, room: updatedRoom } = await this.roomService.updateRoomStatus(
				room.roomId,
				MeetRoomStatus.CLOSED
			);

			// Update room in the list
			this.rooms.set(this.rooms().map((r) => (r.roomId === updatedRoom.roomId ? updatedRoom : r)));

			if (statusCode === 202) {
				this.notificationService.showSnackbar('Room scheduled to be closed when the meeting ends');
			} else {
				this.notificationService.showSnackbar('Room closed successfully');
			}
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
					const errorMessage = this.extractGenericMessage(error.error.message);
					this.showDeletionErrorDialogWithOptions(roomId, errorCode, errorMessage);
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

		this.notificationService.showSnackbar(this.extractGenericMessage(message));
	}

	private showDeletionErrorDialogWithOptions(
		roomId: string,
		errorCode: MeetRoomDeletionErrorCode,
		errorMessage: string
	) {
		// Determine available policy options based on error code
		const showWithMeetingPolicy = errorCode !== MeetRoomDeletionErrorCode.ROOM_HAS_RECORDINGS;
		const showWithRecordingsPolicy = errorCode !== MeetRoomDeletionErrorCode.ROOM_HAS_ACTIVE_MEETING;

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
			showWithMeetingPolicy,
			showWithRecordingsPolicy,
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
				const failed = error.error?.failed;
				const successful = error.error?.successful;
				const message = error.error?.message;

				if (failed && successful) {
					this.handleSuccessfulBulkDeletion(successful);
					this.showBulkDeletionErrorDialogWithOptions(failed, message);
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
		// Determine available policy options based on error codes
		const showWithMeetingPolicy = failedResults.some(
			(result) =>
				this.isValidMeetRoomDeletionErrorCode(result.error) &&
				result.error !== MeetRoomDeletionErrorCode.ROOM_HAS_RECORDINGS
		);
		const showWithRecordingsPolicy = failedResults.some(
			(result) =>
				this.isValidMeetRoomDeletionErrorCode(result.error) &&
				result.error !== MeetRoomDeletionErrorCode.ROOM_HAS_ACTIVE_MEETING
		);

		if (!showWithMeetingPolicy && !showWithRecordingsPolicy) {
			// Generic error
			this.notificationService.showSnackbar(errorMessage);
			this.log.e('Error in bulk delete:', failedResults);
			return;
		}

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
			showWithMeetingPolicy,
			showWithRecordingsPolicy,
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
	private extractGenericMessage(message: string): string {
		// Pattern to match room IDs in single quotes: 'room-id'
		const roomIdPattern = /'[^']+'/g;

		// Remove room ID
		let genericMessage = message.replace(roomIdPattern, '');

		// Clean up any double spaces that might result from the replacement
		genericMessage = genericMessage.replace(/\s+/g, ' ').trim();
		return genericMessage;
	}
}
