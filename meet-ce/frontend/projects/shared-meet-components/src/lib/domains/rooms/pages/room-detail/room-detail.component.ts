import { Clipboard } from '@angular/cdk/clipboard';
import { Component, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MeetRecordingInfo, MeetRoom, MeetRoomMember, MeetRoomStatus } from '@openvidu-meet/typings';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../../shared/components/breadcrumb/breadcrumb.component';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RecordingListsComponent } from '../../../recordings/components/recording-lists/recording-lists.component';
import { RecordingTableAction, RecordingTableFilter } from '../../../recordings/models/recording-list.model';
import { RecordingService } from '../../../recordings/services/recording.service';
import { RoomMemberService } from '../../../room-members/services/room-member.service';
import { DeleteRoomDialogComponent } from '../../components/delete-room-dialog/delete-room-dialog.component';
import { RoomService } from '../../services/room.service';
import { RoomUiUtils } from '../../utils/ui';

@Component({
	selector: 'ov-room-detail',
	imports: [
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatChipsModule,
		MatTabsModule,
		RouterModule,
		BreadcrumbComponent,
		RecordingListsComponent
	],
	templateUrl: './room-detail.component.html',
	styleUrl: './room-detail.component.scss'
})
export class RoomDetailComponent implements OnInit {
	room = signal<MeetRoom | undefined>(undefined);
	isLoading = signal(true);
	breadcrumbItems = signal<BreadcrumbItem[]>([]);

	// Room Members tab
	roomMembers = signal<MeetRoomMember[]>([]);
	loadingMembers = signal(false);

	// Recordings tab
	recordings = signal<MeetRecordingInfo[]>([]);
	loadingRecordings = signal(false);
	hasMoreRecordings = false;
	private nextRecordingsPageToken?: string;

	// Tab management
	selectedTabIndex = signal(0);

	protected log: ILogger;
	MeetRoomStatus = MeetRoomStatus;

	protected readonly RoomUiUtils = RoomUiUtils;

	constructor(
		private route: ActivatedRoute,
		private router: Router,
		private roomService: RoomService,
		private roomMemberService: RoomMemberService,
		private recordingService: RecordingService,
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

			// Load initial data for tabs
			await Promise.all([
				this.loadRoomMembers(roomId),
				this.loadRecordings(roomId)
			]);
		} catch (error) {
			this.log.e('Error loading room details:', error);
			this.notificationService.showSnackbar('Failed to load room details');
			await this.navigationService.navigateTo('rooms');
		} finally {
			this.isLoading.set(false);
		}
	}

	private async loadRoomMembers(roomId: string) {
		try {
			this.loadingMembers.set(true);
			const response = await this.roomMemberService.listRoomMembers(roomId, {
				maxItems: 100,
				sortField: 'membershipDate',
				sortOrder: 'desc'
			});
			this.roomMembers.set(response.members);
		} catch (error) {
			this.log.e('Error loading room members:', error);
			this.notificationService.showSnackbar('Failed to load room members');
		} finally {
			this.loadingMembers.set(false);
		}
	}

	private async loadRecordings(roomId: string, refresh = false) {
		try {
			this.loadingRecordings.set(true);
			const response = await this.recordingService.listRecordings({
				roomId,
				maxItems: 50,
				nextPageToken: !refresh ? this.nextRecordingsPageToken : undefined,
				sortField: 'startDate',
				sortOrder: 'desc'
			});

			if (!refresh) {
				const currentRecordings = this.recordings();
				this.recordings.set([...currentRecordings, ...response.recordings]);
			} else {
				this.recordings.set(response.recordings);
			}

			this.nextRecordingsPageToken = response.pagination.nextPageToken;
			this.hasMoreRecordings = response.pagination.isTruncated;
		} catch (error) {
			this.log.e('Error loading recordings:', error);
			this.notificationService.showSnackbar('Failed to load recordings');
		} finally {
			this.loadingRecordings.set(false);
		}
	}

	async onRecordingAction(action: RecordingTableAction) {
		const recording = action.recordings[0];

		switch (action.action) {
			case 'play':
				await this.recordingService.playRecording(recording.recordingId);
				break;
			case 'download':
				this.recordingService.downloadRecording(recording);
				break;
			case 'shareLink':
				this.recordingService.openShareRecordingDialog(recording.recordingId);
				break;
			case 'delete':
			case 'bulkDelete':
				// Handle delete - can be implemented later
				break;
		}
	}

	async loadMoreRecordings(filters: RecordingTableFilter) {
		if (!this.hasMoreRecordings || this.loadingRecordings()) return;
		const roomId = this.room()?.roomId;
		if (roomId) {
			await this.loadRecordings(roomId);
		}
	}

	async refreshRecordings(filters: RecordingTableFilter) {
		const roomId = this.room()?.roomId;
		if (roomId) {
			this.nextRecordingsPageToken = undefined;
			await this.loadRecordings(roomId, true);
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
}
