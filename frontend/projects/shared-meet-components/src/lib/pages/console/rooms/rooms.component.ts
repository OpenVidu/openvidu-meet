import { Component, OnInit, ViewChild } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { DatePipe, NgClass } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { RoomService, NotificationService, NavigationService } from '../../../services';
import { MeetRoom } from '../../../typings/ce';
import { RoomsListsComponent, RoomTableAction } from '@lib/components';

@Component({
	selector: 'ov-room-preferences',
	standalone: true,
	imports: [
		MatListModule,
		MatCardModule,
		DatePipe,
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
		NgClass
	],
	templateUrl: './rooms.component.html',
	styleUrl: './rooms.component.scss'
})
export class RoomsComponent implements OnInit {
	@ViewChild(MatSort) sort!: MatSort;
	@ViewChild(MatPaginator) paginator!: MatPaginator;
	createdRooms: MeetRoom[] = [];
	dataSource = new MatTableDataSource<MeetRoom>([]);
	displayedColumns: string[] = ['roomName', 'creationDate', 'status', 'autoDeletion', 'actions'];
	isLoading = false;
	showLoadingSpinner = false;
	searchTerm = '';
	protected log: ILogger;

	constructor(
		protected loggerService: LoggerService,
		private roomService: RoomService,
		private notificationService: NotificationService,
		protected navigationService: NavigationService,
		protected route: ActivatedRoute,
		private clipboard: Clipboard
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomService');
	}

	async ngOnInit() {
		await this.refreshRooms();
	}

	private setupTableFeatures() {
		// Setup sorting
		this.dataSource.sort = this.sort;
		this.dataSource.paginator = this.paginator;

		// Custom sorting for dates and status
		this.dataSource.sortingDataAccessor = (item, property) => {
			switch (property) {
				case 'creationDate':
					return new Date(item.creationDate);
				case 'status':
					return item.markedForDeletion ? 1 : 0; // Active rooms first
				case 'autoDeletion':
					return item.autoDeletionDate ? new Date(item.autoDeletionDate) : new Date('9999-12-31'); // Rooms without auto-deletion go last
				case 'roomName':
					return item.roomId;
				default:
					return (item as any)[property];
			}
		};

		// Custom filtering
		this.dataSource.filterPredicate = (data: MeetRoom, filter: string) => {
			const searchStr = filter.toLowerCase();
			return (
				data.roomId.toLowerCase().includes(searchStr) ||
				data.roomIdPrefix?.toLowerCase().includes(searchStr) ||
				false ||
				(data.markedForDeletion ? 'inactive' : 'active').includes(searchStr)
			);
		};
	}

	applyFilter(event: Event) {
		const filterValue = (event.target as HTMLInputElement).value;
		this.searchTerm = filterValue;
		this.dataSource.filter = filterValue.trim().toLowerCase();

		if (this.dataSource.paginator) {
			this.dataSource.paginator.firstPage();
		}
	}

	clearFilter() {
		this.searchTerm = '';
		this.dataSource.filter = '';
		if (this.dataSource.paginator) {
			this.dataSource.paginator.firstPage();
		}
	}

	isInRoomForm(): boolean {
		return (
			this.navigationService.containsRoute('/console/rooms/') &&
			(this.navigationService.containsRoute('/edit') || this.navigationService.containsRoute('/new'))
		);
	}

	async onRoomAction(action: RoomTableAction) {
		switch (action.action) {
			case 'refresh':
				await this.refreshRooms();
				break;
			case 'create':
				await this.createRoom();
				break;
			case 'open':
				this.openRoom(action.rooms[0]);
				break;
			case 'delete':
				await this.deleteRoom(action.rooms[0]);
				break;
			case 'edit':
				await this.viewPreferences(action.rooms[0]);
				break;
			case 'viewRecordings':
				await this.viewRecordings(action.rooms[0]);
				break;
			case 'copyModeratorLink':
				this.copyModeratorLink(action.rooms[0]);
				break;
			case 'copyPublisherLink':
				this.copyPublisherLink(action.rooms[0]);
				break;
			case 'batchDelete':
				// await this.deleteRoom(action.rooms);
				break;
		}
	}

	async createRoom() {
		try {
			this.navigationService.navigateTo('/console/rooms/new');
		} catch (error) {
			this.notificationService.showAlert('Error creating room');
			this.log.e('Error creating room:', error);
			return;
		}
	}

	openRoom(room: MeetRoom) {
		window.open(room.publisherRoomUrl, '_blank');
	}

	async deleteRoom({ roomId }: MeetRoom) {
		try {
			const response = await this.roomService.deleteRoom(roomId);
			if (response.statusCode === 202) {
				this.notificationService.showSnackbar('Room marked for deletion');
				// If the room is marked for deletion, we don't remove it from the list immediately
				this.createdRooms = this.createdRooms.map((r) =>
					r.roomId === roomId ? { ...r, markedForDeletion: true } : r
				);
				// Update the data source to reflect the change
				this.dataSource.data = this.createdRooms;
				return;
			}
			this.createdRooms = this.createdRooms.filter((r) => r.roomId !== roomId);
			this.dataSource.data = this.createdRooms;
			this.notificationService.showSnackbar('Room deleted');
		} catch (error) {
			this.notificationService.showAlert('Error deleting room');
			this.log.e('Error deleting room:', error);
		}
	}

	async refreshRooms() {
		this.isLoading = true;
		const delaySpinner = setTimeout(() => {
			this.showLoadingSpinner = true;
		}, 200);
		try {
			const { rooms } = await this.roomService.listRooms();
			this.createdRooms = rooms;
			this.dataSource.data = this.createdRooms;
			this.setupTableFeatures();
		} catch (error) {
			console.error('Error fetching room preferences', error);
		} finally {
			this.isLoading = false;
			clearTimeout(delaySpinner);
			this.showLoadingSpinner = false;
		}
	}

	async onRoomClicked({ roomId }: MeetRoom) {
		try {
			this.navigationService.navigateTo(`/console/rooms/${roomId}/edit`);
		} catch (error) {
			this.notificationService.showAlert('Error navigating to room details');
			this.log.e('Error navigating to room details:', error);
			return;
		}
	}

	copyModeratorLink(room: MeetRoom) {
		this.clipboard.copy(room.moderatorRoomUrl);
		this.notificationService.showSnackbar('Moderator link copied to clipboard');
	}

	copyPublisherLink(room: MeetRoom) {
		this.clipboard.copy(room.publisherRoomUrl);
		this.notificationService.showSnackbar('Publisher link copied to clipboard');
	}

	async viewRecordings(room: MeetRoom) {
		// Navigate to recordings page for this room
		try {
			await this.navigationService.navigateTo('/console/recordings', { roomId: room.roomId });
		} catch (error) {
			this.notificationService.showAlert('Error navigating to recordings');
			this.log.e('Error navigating to recordings:', error);
		}
	}

	async viewPreferences(room: MeetRoom) {
		// Check if room is marked for deletion
		if (room.markedForDeletion) {
			this.notificationService.showAlert(
				'Room preferences cannot be modified. This room is marked for deletion.'
			);
			return;
		}

		try {
			await this.navigationService.navigateTo(`console/rooms/${room.roomId}/edit`);
		} catch (error) {
			this.notificationService.showAlert('Error navigating to room preferences');
			this.log.e('Error navigating to room preferences:', error);
		}
	}
}
