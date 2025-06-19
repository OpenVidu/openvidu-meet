import { Component, OnInit, ViewChild } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { DatePipe, NgClass, NgIf } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListItem, MatListModule } from '@angular/material/list';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { RoomService, NotificationService, NavigationService } from '../../../services';
import { DynamicGridComponent, ToggleCardComponent } from '../../../components';
import { MeetRoom } from '../../../typings/ce';

@Component({
	selector: 'ov-room-preferences',
	standalone: true,
	imports: [
		DynamicGridComponent,
		ToggleCardComponent,
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
		NgClass,
		NgIf
	],
	templateUrl: './rooms.component.html',
	styleUrl: './rooms.component.scss'
})
export class RoomsComponent implements OnInit {
	@ViewChild(MatSort) sort!: MatSort;
	@ViewChild(MatPaginator) paginator!: MatPaginator;

	createdRooms: MeetRoom[] = [];
	dataSource = new MatTableDataSource<MeetRoom>([]);
	displayedColumns: string[] = ['roomName', 'creationDate', 'status', 'actions'];
	isLoading = false;
	searchTerm = '';
	recordingEnabled = false;
	chatEnabled = false;
	backgroundsEnabled = false;
	protected log: ILogger;

	constructor(
		protected loggerService: LoggerService,
		private roomService: RoomService,
		private notificationService: NotificationService,
		protected router: Router,
		protected navigationService: NavigationService,
		protected route: ActivatedRoute,
		private clipboard: Clipboard
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomService');
	}

	async ngOnInit() {
		this.isLoading = true;
		try {
			const { rooms } = await this.roomService.listRooms();
			this.createdRooms = rooms;
			this.dataSource.data = this.createdRooms;
			this.setupTableFeatures();
		} catch (error) {
			console.error('Error fetching room preferences', error);
		} finally {
			this.isLoading = false;
		}
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
				(data.markedForDeletion ? 'marked for deletion' : 'active').includes(searchStr)
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
			this.router.url.includes('/new') ||
			this.router.url.includes('/edit') ||
			this.router.url.includes('/preferences')
		);
	}

	async createRoom() {
		//TODO: Go to room details page
		await this.router.navigate(['new'], { relativeTo: this.route });
		// try {
		// 	const room = await this.roomService.createRoom();
		// 	this.notificationService.showSnackbar('Room created');
		// 	this.log.d('Room created:', room);
		// 	this.createdRooms.push(room);
		// } catch (error) {
		// 	this.notificationService.showAlert('Error creating room');
		// 	this.log.e('Error creating room:', error);
		// }
	}

	openRoom(room: MeetRoom) {
		window.open(room.publisherRoomUrl, '_blank');
	}

	deleteRoom({ roomId }: MeetRoom) {
		try {
			this.roomService.deleteRoom(roomId);
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
		try {
			const { rooms } = await this.roomService.listRooms();
			this.createdRooms = rooms;
			this.dataSource.data = this.createdRooms;
		} catch (error) {
			console.error('Error refreshing rooms', error);
			this.notificationService.showAlert('Error refreshing rooms');
		} finally {
			this.isLoading = false;
		}
	}

	async onRoomClicked({ roomId }: MeetRoom) {
		//TODO: Go to room details page
		await this.router.navigate([roomId, 'edit'], { relativeTo: this.route });
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
		// Navigate to room preferences/settings
		try {
			await this.navigationService.navigateTo(`console/rooms/${room.roomId}/edit`);
		} catch (error) {
			this.notificationService.showAlert('Error navigating to room preferences');
			this.log.e('Error navigating to room preferences:', error);
		}
	}

	// async onRecordingToggle(enabled: boolean) {
	// 	console.log('Recording toggled', enabled);

	// 	try {
	// 		this.roomPreferences.recordingPreferences.enabled = enabled;
	// 		await this.roomService.saveRoomPreferences(this.roomPreferences);
	// 		this.recordingEnabled = enabled;

	// 		// TODO: Show a toast message
	// 	} catch (error) {
	// 		console.error('Error saving recording preferences', error);
	// 		// TODO: Show a toast message
	// 	}
	// }

	// async onChatToggle(enabled: boolean) {
	// 	console.log('Chat toggled', enabled);

	// 	try {
	// 		this.roomPreferences.chatPreferences.enabled = enabled;
	// 		await this.roomService.saveRoomPreferences(this.roomPreferences);
	// 		this.chatEnabled = enabled;
	// 		// TODO: Show a toast message
	// 	} catch (error) {
	// 		console.error('Error saving chat preferences', error);
	// 		// TODO: Show a toast message
	// 	}
	// }

	// async onVirtualBackgroundToggle(enabled: boolean) {
	// 	console.log('Virtual background toggled', enabled);

	// 	try {
	// 		this.roomPreferences.virtualBackgroundPreferences.enabled = enabled;
	// 		await this.roomService.saveRoomPreferences(this.roomPreferences);
	// 		this.backgroundsEnabled = enabled;
	// 		// TODO: Show a toast message
	// 	} catch (error) {
	// 		console.error('Error saving virtual background preferences', error);
	// 		// TODO: Show a toast message
	// 	}
	// }

	/**
	 * Loads the room preferences from the global preferences service and assigns them to the component's properties.
	 *
	 * @returns {Promise<void>} A promise that resolves when the room preferences have been loaded and assigned.
	 */
	// private async loadRoomPreferences() {
	// 	const preferences = await this.roomService.getRoomPreferences();
	// 	this.roomPreferences = preferences;

	// 	console.log('Room preferences:', preferences);

	// 	// Destructures the `preferences` object to extract the enabled status of various features.
	// 	const {
	// 		recordingPreferences: { enabled: recordingEnabled },
	// 		chatPreferences: { enabled: chatEnabled },
	// 		virtualBackgroundPreferences: { enabled: backgroundsEnabled }
	// 	} = preferences;

	// 	// Assigns the extracted values to the component's properties.
	// 	Object.assign(this, { recordingEnabled, chatEnabled, backgroundsEnabled });
	// }
}
