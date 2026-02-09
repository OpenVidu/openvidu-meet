import { Clipboard } from '@angular/cdk/clipboard';
import { Component, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MeetRoom, MeetRoomStatus } from '@openvidu-meet/typings';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../../shared/components/breadcrumb/breadcrumb.component';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { DeleteRoomDialogComponent } from '../../components/delete-room-dialog/delete-room-dialog.component';
import { RoomService } from '../../services/room.service';

@Component({
	selector: 'ov-room-detail',
	imports: [
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatChipsModule,
		RouterModule,
		BreadcrumbComponent
	],
	templateUrl: './room-detail.component.html',
	styleUrl: './room-detail.component.scss'
})
export class RoomDetailComponent implements OnInit {
	room = signal<MeetRoom | null>(null);
	isLoading = signal(true);
	breadcrumbItems = signal<BreadcrumbItem[]>([]);
	protected log: ILogger;
	MeetRoomStatus = MeetRoomStatus;

	constructor(
		private route: ActivatedRoute,
		private router: Router,
		private roomService: RoomService,
		private notificationService: NotificationService,
		protected navigationService: NavigationService,
		private clipboard: Clipboard,
		private dialog: MatDialog,
		protected loggerService: LoggerService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomDetailComponent');
	}

	async ngOnInit() {
		const roomId = this.route.snapshot.paramMap.get('roomId');
		if (!roomId) {
			this.notificationService.showSnackbar('Room ID is required');
			await this.navigationService.navigateTo('rooms');
			return;
		}

		await this.loadRoomDetails(roomId);
	}

	private async loadRoomDetails(roomId: string) {
		try {
			this.isLoading.set(true);
			const room = await this.roomService.getRoom(roomId);
			debugger;
			this.room.set(room);

			// Update breadcrumb items
			this.breadcrumbItems.set([
				{
					label: 'Rooms',
					action: () => this.navigationService.navigateTo('rooms')
				},
				{
					label: room.roomName
				}
			]);
		} catch (error) {
			this.log.e('Error loading room details:', error);
			this.notificationService.showSnackbar('Failed to load room details');
			await this.navigationService.navigateTo('rooms');
		} finally {
			this.isLoading.set(false);
		}
	}

	async joinRoom() {
		const room = this.room();
		if (!room) return;

		window.open(room.accessUrl, '_blank');
	}

	copyAccessLink() {
		const room = this.room();
		if (!room) return;

		this.clipboard.copy(room.accessUrl);
		this.notificationService.showSnackbar('Access link copied to clipboard');
	}

	async editRoom() {
		const room = this.room();
		if (!room) return;

		await this.navigationService.navigateTo(`rooms/${room.roomId}/edit`);
	}

	async deleteRoom() {
		const room = this.room();
		if (!room) return;

		const dialogRef = this.dialog.open(DeleteRoomDialogComponent, {
			data: {
				rooms: [room],
				hasMeetings: room.status === MeetRoomStatus.ACTIVE_MEETING,
				hasRecordings: false // You may need to check this separately
			},
			width: '500px',
			disableClose: true
		});

		const result = await dialogRef.afterClosed().toPromise();

		if (result?.confirmed) {
			try {
				await this.roomService.deleteRoom(room.roomId, result.deletionPolicy);
				this.notificationService.showSnackbar('Room deleted successfully');
				await this.navigationService.navigateTo('rooms');
			} catch (error) {
				this.log.e('Error deleting room:', error);
				this.notificationService.showSnackbar('Failed to delete room');
			}
		}
	}

	getFormattedDate(timestamp: number): string {
		return new Date(timestamp).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	getAutoDeletionStatus(): string {
		const room = this.room();
		if (!room) return 'N/A';

		if (room.autoDeletionDate) {
			return this.getFormattedDate(room.autoDeletionDate);
		}

		return 'Disabled';
	}

	isActiveRoom(): boolean {
		return this.room()?.status === MeetRoomStatus.ACTIVE_MEETING;
	}

	isClosedRoom(): boolean {
		return this.room()?.status === MeetRoomStatus.CLOSED;
	}

	getOwnerInitials(): string {
		const room = this.room();
		if (!room || !room.owner) return '';
		return room.owner.substring(0, 2).toUpperCase();
	}
}
