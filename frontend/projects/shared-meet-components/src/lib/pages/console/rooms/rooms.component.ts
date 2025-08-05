import { Clipboard } from '@angular/cdk/clipboard';
import { Component, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
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
import { NavigationService, NotificationService, RoomService } from '@lib/services';
import { MeetRoom, MeetRoomFilters } from '@lib/typings/ce';
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
	isLoading = false;
	showLoadingSpinner = false;

	// Pagination
	hasMoreRooms = false;
	private nextPageToken?: string;

	protected log: ILogger;

	constructor(
		protected loggerService: LoggerService,
		private roomService: RoomService,
		private notificationService: NotificationService,
		protected navigationService: NavigationService,
		private clipboard: Clipboard
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomService');
	}

	async ngOnInit() {
		await this.loadRooms();
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
			case 'copyPublisherLink':
				this.copyPublisherLink(action.rooms[0]);
				break;
			case 'viewRecordings':
				await this.viewRecordings(action.rooms[0]);
				break;
			case 'delete':
				this.deleteRoom(action.rooms[0]);
				break;
			case 'bulkDelete':
				this.bulkDeleteRooms(action.rooms);
				break;
		}
	}

	private async loadRooms() {
		this.isLoading = true;
		const delaySpinner = setTimeout(() => {
			this.showLoadingSpinner = true;
		}, 200);

		try {
			const roomFilters: MeetRoomFilters = {
				maxItems: 50,
				nextPageToken: this.nextPageToken
			};
			const response = await this.roomService.listRooms(roomFilters);

			// TODO: Filter rooms

			// Update rooms list
			const currentRooms = this.rooms();
			this.rooms.set([...currentRooms, ...response.rooms]);

			// TODO: Sort rooms
			// this.dataSource.data = this.rooms();
			// this.setupTableFeatures();

			// Update pagination
			this.nextPageToken = response.pagination.nextPageToken;
			this.hasMoreRooms = response.pagination.isTruncated;
		} catch (error) {
			this.notificationService.showAlert('Error loading rooms');
			this.log.e('Error loading rooms:', error);
		} finally {
			this.isLoading = false;
			clearTimeout(delaySpinner);
			this.showLoadingSpinner = false;
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

	async loadMoreRooms() {
		if (!this.hasMoreRooms || this.isLoading) return;
		await this.loadRooms();
	}

	async refreshRooms() {
		this.rooms.set([]);
		this.nextPageToken = undefined;
		this.hasMoreRooms = false;
		await this.loadRooms();
	}

	private async createRoom() {
		try {
			await this.navigationService.navigateTo('rooms/new');
		} catch (error) {
			this.notificationService.showAlert('Error creating room');
			this.log.e('Error creating room:', error);
			return;
		}
	}

	private openRoom(room: MeetRoom) {
		window.open(room.moderatorRoomUrl, '_blank');
	}

	private async editRoomPreferences(room: MeetRoom) {
		// Check if room is marked for deletion
		if (room.markedForDeletion) {
			this.notificationService.showAlert(
				'Room preferences cannot be modified. This room is marked for deletion.'
			);
			return;
		}

		try {
			await this.navigationService.navigateTo(`rooms/${room.roomId}/edit`);
		} catch (error) {
			this.notificationService.showAlert('Error navigating to room preferences');
			this.log.e('Error navigating to room preferences:', error);
		}
	}

	private copyModeratorLink(room: MeetRoom) {
		this.clipboard.copy(room.moderatorRoomUrl);
		this.notificationService.showSnackbar('Moderator link copied to clipboard');
	}

	private copyPublisherLink(room: MeetRoom) {
		this.clipboard.copy(room.publisherRoomUrl);
		this.notificationService.showSnackbar('Publisher link copied to clipboard');
	}

	private async viewRecordings(room: MeetRoom) {
		// Navigate to recordings page for this room
		try {
			await this.navigationService.navigateTo('recordings', { 'room-id': room.roomId });
		} catch (error) {
			this.notificationService.showAlert('Error navigating to recordings');
			this.log.e('Error navigating to recordings:', error);
		}
	}

	private deleteRoom({ roomId }: MeetRoom) {
		const deleteCallback = async () => {
			try {
				const response = await this.roomService.deleteRoom(roomId);
				if (response.statusCode === 202) {
					// If the room is marked for deletion, we don't remove it from the list immediately
					const currentRooms = this.rooms();
					this.rooms.set(
						currentRooms.map((r) => (r.roomId === roomId ? { ...r, markedForDeletion: true } : r))
					);
					// this.dataSource.data = this.rooms();
					this.notificationService.showSnackbar('Room marked for deletion');
					return;
				}

				const currentRooms = this.rooms();
				this.rooms.set(currentRooms.filter((r) => r.roomId !== roomId));
				// this.dataSource.data = this.rooms();
				this.notificationService.showSnackbar('Room deleted successfully');
			} catch (error) {
				this.notificationService.showAlert('Failed to delete room');
				this.log.e('Error deleting room:', error);
			}
		};

		const forceDeleteCallback = async () => {
			try {
				await this.roomService.deleteRoom(roomId, true);

				const currentRooms = this.rooms();
				this.rooms.set(currentRooms.filter((r) => r.roomId !== roomId));
				this.notificationService.showSnackbar('Room force deleted successfully');
			} catch (error) {
				this.notificationService.showAlert('Failed to force delete room');
				this.log.e('Error force deleting room:', error);
			}
		};

		this.notificationService.showDialog({
			confirmText: 'Delete',
			cancelText: 'Cancel',
			title: 'Delete Room',
			message: `Are you sure you want to delete the room <b>${roomId}</b>?`,
			confirmCallback: deleteCallback,
			showForceCheckbox: true,
			forceCheckboxText: 'Force delete',
			forceCheckboxDescription:
				'This will immediately disconnect all active participants and delete the room without waiting for participants to leave',
			forceConfirmCallback: forceDeleteCallback
		});
	}

	private bulkDeleteRooms(rooms: MeetRoom[]) {
		const bulkDeleteCallback = async () => {
			try {
				const roomIds = rooms.map((r) => r.roomId);
				const response = await this.roomService.bulkDeleteRooms(roomIds);

				const currentRooms = this.rooms();

				switch (response.statusCode) {
					case 202:
						// All rooms were marked for deletion
						// We don't remove them from the list immediately
						this.rooms.set(
							currentRooms.map((r) =>
								roomIds.includes(r.roomId) ? { ...r, markedForDeletion: true } : r
							)
						);
						this.notificationService.showSnackbar('All rooms marked for deletion');
						break;
					case 204:
						// All rooms were deleted directly
						// We remove them from the list immediately
						this.rooms.set(currentRooms.filter((r) => !roomIds.includes(r.roomId)));
						this.notificationService.showSnackbar('All rooms deleted successfully');
						break;
					case 200:
						// Some rooms were marked for deletion, some were deleted
						const { markedForDeletion = [], deleted = [] } = response;

						this.rooms.set(
							currentRooms
								.map((r) =>
									markedForDeletion.includes(r.roomId) ? { ...r, markedForDeletion: true } : r
								)
								.filter((r) => !deleted.includes(r.roomId))
						);

						let msg = '';
						if (markedForDeletion.length > 0) {
							msg += `${markedForDeletion.length} room(s) marked for deletion. `;
						}
						if (deleted.length > 0) {
							msg += `${deleted.length} room(s) deleted successfully.`;
						}

						this.notificationService.showSnackbar(msg.trim());
						break;
				}
			} catch (error) {
				this.notificationService.showAlert('Failed to delete rooms');
				this.log.e('Error deleting rooms:', error);
			}
		};

		const bulkForceDeleteCallback = async () => {
			try {
				const roomIds = rooms.map((r) => r.roomId);
				await this.roomService.bulkDeleteRooms(roomIds, true);

				const currentRooms = this.rooms();
				this.rooms.set(currentRooms.filter((r) => !roomIds.includes(r.roomId)));
				this.notificationService.showSnackbar('All rooms force deleted successfully');
			} catch (error) {
				this.notificationService.showAlert('Failed to force delete rooms');
				this.log.e('Error force deleting rooms:', error);
			}
		};

		const count = rooms.length;
		this.notificationService.showDialog({
			confirmText: 'Delete all',
			cancelText: 'Cancel',
			title: 'Delete Rooms',
			message: `Are you sure you want to delete <b>${count}</b> rooms?`,
			confirmCallback: bulkDeleteCallback,
			showForceCheckbox: true,
			forceCheckboxText: 'Force delete',
			forceCheckboxDescription:
				'This will immediately disconnect all active participants and delete all rooms without waiting for participants to leave',
			forceConfirmCallback: bulkForceDeleteCallback
		});
	}
}
