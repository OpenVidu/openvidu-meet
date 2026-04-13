import { Clipboard } from '@angular/cdk/clipboard';
import { Component, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
	MeetRecordingInfo,
	MeetRoom,
	MeetRoomDeletionSuccessCode,
	MeetRoomMember,
	MeetRoomStatus,
	SortOrder
} from '@openvidu-meet/typings';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../../shared/components/breadcrumb/breadcrumb.component';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RecordingListsComponent } from '../../../recordings/components/recording-lists/recording-lists.component';
import { RecordingTableAction, RecordingTableFilter } from '../../../recordings/models/recording-list.model';
import { RecordingService } from '../../../recordings/services/recording.service';
import {
	MemberTableAction,
	MemberTableFilter,
	RoomMembersListsComponent
} from '../../../room-members/components/room-members-list/room-members-list.component';
import { RoomMemberService } from '../../../room-members/services/room-member.service';
import { RoomDeletionService } from '../../services/room-deletion.service';
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
		RecordingListsComponent,
		RoomMembersListsComponent
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
	hasMoreMembers = false;
	private nextMembersPageToken?: string;

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
		private roomDeletionService: RoomDeletionService,
		private roomMemberService: RoomMemberService,
		private recordingService: RecordingService,
		private notificationService: NotificationService,
		protected navigationService: NavigationService,
		private clipboard: Clipboard,
		protected loggerService: LoggerService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomDetailComponent');
	}

	async ngOnInit() {
		const roomId = this.route.snapshot.paramMap.get('roomId');
		if (!roomId) {
			this.notificationService.showSnackbar('Room ID is required');
			await this.navigationService.navigateTo('/rooms');
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
					action: () => this.navigationService.navigateTo('/rooms')
				},
				{
					label: room.roomName
				}
			]);

			// Load initial data for tabs
			await Promise.all([this.loadRoomMembers(roomId, undefined), this.loadRecordings(roomId)]);
		} catch (error) {
			this.log.e('Error loading room details:', error);
			this.notificationService.showSnackbar('Failed to load room details');
			await this.navigationService.navigateTo('/rooms');
		} finally {
			this.isLoading.set(false);
		}
	}

	private async loadRoomMembers(roomId: string, filters?: MemberTableFilter, refresh = false) {
		try {
			this.loadingMembers.set(true);
			const response = await this.roomMemberService.listRoomMembers(roomId, {
				maxItems: 50,
				nextPageToken: !refresh ? this.nextMembersPageToken : undefined,
				sortField: filters?.sortField ?? 'membershipDate',
				sortOrder: filters?.sortOrder ?? SortOrder.DESC,
				...(filters?.nameFilter ? { name: filters.nameFilter } : {})
			});

			if (!refresh) {
				const currentMembers = this.roomMembers();
				this.roomMembers.set([...currentMembers, ...response.members]);
			} else {
				this.roomMembers.set(response.members);
			}

			this.nextMembersPageToken = response.pagination.nextPageToken;
			this.hasMoreMembers = response.pagination.isTruncated;
		} catch (error) {
			this.log.e('Error loading room members:', error);
			this.notificationService.showSnackbar('Failed to load room members');
		} finally {
			this.loadingMembers.set(false);
		}
	}

	async loadMoreRoomMembers(filters: MemberTableFilter) {
		if (!this.hasMoreMembers || this.loadingMembers()) return;
		const roomId = this.room()?.roomId;
		if (roomId) {
			await this.loadRoomMembers(roomId, filters);
		}
	}

	async refreshRoomMembers(filters: MemberTableFilter) {
		const roomId = this.room()?.roomId;
		if (roomId) {
			this.nextMembersPageToken = undefined;
			await this.loadRoomMembers(roomId, filters, true);
		}
	}

	async onMemberAction(action: MemberTableAction) {
		switch (action.action) {
			case 'copyLink': {
				const member = action.members[0];
				if (member?.accessUrl) {
					this.clipboard.copy(member.accessUrl);
					this.notificationService.showSnackbar('Member access URL copied to clipboard');
				}
				break;
			}
			case 'delete': {
				const member = action.members[0];
				if (!member) break;
				this.notificationService.showDialog({
					title: 'Remove Member',
					icon: 'person_remove',
					message: `Are you sure you want to remove <b>${member.name}</b> from this room?`,
					confirmText: 'Remove',
					cancelText: 'Cancel',
					confirmCallback: async () => {
						try {
							const roomId = this.room()?.roomId;
							if (!roomId) return;
							await this.roomMemberService.deleteRoomMember(roomId, member.memberId);
							this.roomMembers.set(this.roomMembers().filter((m) => m.memberId !== member.memberId));
							this.notificationService.showSnackbar('Member removed successfully');
						} catch (error) {
							this.log.e('Error removing member:', error);
							this.notificationService.showSnackbar('Failed to remove member');
						}
					}
				});
				break;
			}
			case 'bulkDelete': {
				const memberIds = action.members.map((m) => m.memberId);
				const roomId = this.room()?.roomId;
				if (!roomId || memberIds.length === 0) break;
				this.notificationService.showDialog({
					title: 'Remove Members',
					icon: 'group_remove',
					message: `Are you sure you want to remove <b>${memberIds.length}</b> members from this room?`,
					confirmText: 'Remove all',
					cancelText: 'Cancel',
					confirmCallback: async () => {
						try {
							await this.roomMemberService.bulkDeleteRoomMembers(roomId, memberIds);
							this.roomMembers.set(this.roomMembers().filter((m) => !memberIds.includes(m.memberId)));
							this.notificationService.showSnackbar('Members removed successfully');
						} catch (error) {
							this.log.e('Error removing members:', error);
							this.notificationService.showSnackbar('Failed to remove members');
						}
					}
				});
				break;
			}
		}
	}

	async onAddMember(): Promise<void> {
		const roomId = this.room()?.roomId;
		if (roomId) {
			await this.navigationService.navigateTo(`/rooms/${roomId}/members/new`);
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
				sortOrder: SortOrder.DESC
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
				this.recordingService.openShareRecordingDialog(recording.recordingId, true);
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

		window.open(room.access.registered.url, '_blank');
	}

	copyAccessLink() {
		const room = this.room();
		if (!room) return;

		this.clipboard.copy(room.access.registered.url);
		this.notificationService.showSnackbar('Access link copied to clipboard');
	}

	async editRoom() {
		const room = this.room();
		if (!room) return;

		await this.navigationService.navigateTo(`/rooms/${room.roomId}/edit`);
	}

	deleteRoom() {
		const room = this.room();
		if (!room) return;

		this.roomDeletionService.deleteRoomWithConfirmation({
			roomId: room.roomId,
			log: this.log,
			onSuccess: async ({ successCode, message, room: updatedRoom }) => {
				await this.handleSuccessfulDeletion(successCode, message, updatedRoom);
			}
		});
	}

	private async handleSuccessfulDeletion(
		successCode: MeetRoomDeletionSuccessCode,
		message: string,
		updatedRoom?: MeetRoom
	) {
		if (updatedRoom) {
			// Room was not deleted but updated (e.g., closed due to active meeting)
			if (successCode === MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_CLOSED) {
				updatedRoom.status = MeetRoomStatus.CLOSED;
			}
			this.room.set(updatedRoom);
		} else {
			// Room was deleted, navigate back to the rooms list
			await this.navigationService.navigateTo('/rooms');
		}
		this.notificationService.showSnackbar(this.roomDeletionService.removeRoomIdFromMessage(message));
	}
}
