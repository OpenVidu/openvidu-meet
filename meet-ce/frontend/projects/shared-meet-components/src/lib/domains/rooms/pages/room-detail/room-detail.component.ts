import { Clipboard } from '@angular/cdk/clipboard';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterModule } from '@angular/router';
import {
	MeetRecordingFilters,
	MeetRecordingInfo,
	MeetRoom,
	MeetRoomDeletionSuccessCode,
	MeetRoomMember,
	MeetRoomMemberFilters,
	MeetRoomStatus,
	SortOrder
} from '@openvidu-meet/typings';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../../shared/components/breadcrumb/breadcrumb.component';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { ILogger, LoggerService } from '../../../meeting/openvidu-components';
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
		DatePipe,
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
	styleUrl: './room-detail.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomDetailComponent implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly roomService = inject(RoomService);
	private readonly roomDeletionService = inject(RoomDeletionService);
	private readonly roomMemberService = inject(RoomMemberService);
	private readonly recordingService = inject(RecordingService);
	private readonly notificationService = inject(NotificationService);
	protected readonly navigationService = inject(NavigationService);
	private readonly clipboard = inject(Clipboard);
	private readonly loggerService = inject(LoggerService);
	protected readonly log: ILogger = this.loggerService.get('OpenVidu Meet - RoomDetailComponent');

	roomId = signal('');
	room = signal<MeetRoom | undefined>(undefined);
	isLoading = signal(true);
	breadcrumbItems = signal<BreadcrumbItem[]>([]);

	// Room Members tab
	roomMembers = signal<MeetRoomMember[]>([]);
	loadingMembers = signal(false);
	hasMoreMembers = signal(false);
	initialMemberFilters = signal<MemberTableFilter>({
		nameFilter: '',
		sortField: 'membershipDate',
		sortOrder: SortOrder.DESC
	});
	private nextMembersPageToken?: string;

	// Recordings tab
	recordings = signal<MeetRecordingInfo[]>([]);
	loadingRecordings = signal(false);
	hasMoreRecordings = signal(false);
	initialRecordingFilters = signal<RecordingTableFilter>({
		nameFilter: '',
		statusFilter: '',
		sortField: 'startDate',
		sortOrder: SortOrder.DESC
	});
	private nextRecordingsPageToken?: string;

	// Tab management
	selectedTabIndex = signal(0);

	MeetRoomStatus = MeetRoomStatus;
	protected readonly RoomUiUtils = RoomUiUtils;

	async ngOnInit() {
		const roomId = this.route.snapshot.paramMap.get('room-id');
		if (!roomId) {
			await this.navigationService.navigateTo('/rooms');
			return;
		}

		this.roomId.set(roomId);
		await this.loadRoomDetails();
	}

	// --- Room management ---

	private async loadRoomDetails() {
		const delayLoader = setTimeout(() => {
			this.isLoading.set(true);
		}, 200);

		try {
			const room = await this.roomService.getRoom(this.roomId());
			this.room.set(room);

			// Update breadcrumb items
			this.breadcrumbItems.set([
				{
					label: 'Rooms',
					action: () => this.navigationService.navigateTo('/rooms')
				},
				{
					label: room.roomId
				}
			]);

			// Load initial data for tabs
			await Promise.all([
				this.loadRoomMembers(this.initialMemberFilters()),
				this.loadRecordings(this.initialRecordingFilters())
			]);
		} catch (error) {
			this.log.e('Error loading room details:', error);
			this.notificationService.showSnackbar('Failed to load room details');
			await this.navigationService.navigateTo('/rooms');
		} finally {
			clearTimeout(delayLoader);
			this.isLoading.set(false);
		}
	}

	async joinRoom() {
		const room = this.room()!;
		window.open(room.access.registered.url, '_blank');
	}

	copyAccessLink() {
		const room = this.room()!;
		this.clipboard.copy(room.access.registered.url);
		this.notificationService.showSnackbar('Access link copied to clipboard');
	}

	async editRoom() {
		const room = this.room()!;
		await this.navigationService.navigateTo(`/rooms/${room.roomId}/edit`);
	}

	async toggleRoomStatus() {
		const room = this.room()!;

		if (room.status !== MeetRoomStatus.CLOSED) {
			await this.closeRoom();
		} else {
			await this.reopenRoom();
		}
	}

	private async reopenRoom() {
		try {
			const { room: updatedRoom } = await this.roomService.updateRoomStatus(this.roomId(), MeetRoomStatus.OPEN);
			this.room.set(updatedRoom);
			this.notificationService.showSnackbar('Room reopened successfully');
		} catch (error) {
			this.notificationService.showSnackbar('Failed to reopen room');
			this.log.e('Error reopening room:', error);
		}
	}

	private async closeRoom() {
		try {
			const { message, room: updatedRoom } = await this.roomService.updateRoomStatus(
				this.roomId(),
				MeetRoomStatus.CLOSED
			);
			this.room.set(updatedRoom);
			this.notificationService.showSnackbar(this.roomDeletionService.removeRoomIdFromMessage(message));
		} catch (error) {
			this.notificationService.showSnackbar('Failed to close room');
			this.log.e('Error closing room:', error);
		}
	}

	deleteRoom() {
		this.roomDeletionService.deleteRoomWithConfirmation({
			roomId: this.roomId(),
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

	// --- Room Members management ---

	private async loadRoomMembers(filters: MemberTableFilter, refresh = false) {
		const delayLoader = setTimeout(() => {
			this.loadingMembers.set(true);
		}, 200);

		try {
			const memberFilters: MeetRoomMemberFilters = {
				maxItems: 50,
				nextPageToken: !refresh ? this.nextMembersPageToken : undefined,
				sortField: filters.sortField,
				sortOrder: filters.sortOrder
			};

			// Apply member name filter if provided
			if (filters.nameFilter) {
				memberFilters.name = filters.nameFilter;
			}

			const response = await this.roomMemberService.listRoomMembers(this.roomId(), memberFilters);

			if (!refresh) {
				// Update members list
				this.roomMembers.set([...this.roomMembers(), ...response.members]);
			} else {
				// Replace members list
				this.roomMembers.set(response.members);
			}

			// Update pagination
			this.nextMembersPageToken = response.pagination.nextPageToken;
			this.hasMoreMembers.set(response.pagination.isTruncated);
		} catch (error) {
			this.log.e('Error loading room members:', error);
			this.notificationService.showSnackbar('Failed to load room members');
		} finally {
			clearTimeout(delayLoader);
			this.loadingMembers.set(false);
		}
	}

	async loadMoreRoomMembers(filters: MemberTableFilter) {
		if (!this.hasMoreMembers() || this.loadingMembers()) return;
		await this.loadRoomMembers(filters);
	}

	async refreshRoomMembers(filters: MemberTableFilter) {
		this.nextMembersPageToken = undefined;
		await this.loadRoomMembers(filters, true);
	}

	async onMemberAction(action: MemberTableAction) {
		switch (action.action) {
			case 'addMember':
				await this.addMember();
				break;
			case 'edit':
				await this.editMember(action.members[0]);
				break;
			case 'copyLink':
				this.copyMemberLink(action.members[0]);
				break;
			case 'delete':
				this.deleteMember(action.members[0]);
				break;
			case 'bulkDelete':
				this.bulkDeleteMembers(action.members);
				break;
		}
	}

	private async addMember() {
		await this.navigationService.navigateTo(`/rooms/${this.roomId()}/members/new`);
	}

	private async editMember(member: MeetRoomMember) {
		await this.navigationService.navigateTo(`/rooms/${this.roomId()}/members/${member.memberId}/edit`);
	}

	private copyMemberLink(member: MeetRoomMember) {
		this.clipboard.copy(member.accessUrl);
		this.notificationService.showSnackbar('Member access URL copied to clipboard');
	}

	private deleteMember(member: MeetRoomMember) {
		this.notificationService.showDialog({
			title: 'Remove Member',
			icon: 'person_remove',
			message: `Are you sure you want to remove <b>${member.name}</b> from this room?`,
			confirmText: 'Remove',
			cancelText: 'Cancel',
			confirmCallback: async () => {
				try {
					await this.roomMemberService.deleteRoomMember(this.roomId(), member.memberId);

					// Remove deleted member from the list
					this.roomMembers.set(this.roomMembers().filter((m) => m.memberId !== member.memberId));
					this.notificationService.showSnackbar(`Member "${member.name}" removed successfully`);
				} catch (error) {
					this.log.e('Error removing member:', error);
					this.notificationService.showSnackbar('Failed to remove member');
				}
			}
		});
	}

	private bulkDeleteMembers(members: MeetRoomMember[]) {
		const bulkDeleteCallback = async () => {
			try {
				const memberIds = members.map((m) => m.memberId);
				const { deleted } = await this.roomMemberService.bulkDeleteRoomMembers(this.roomId(), memberIds);

				// Remove deleted members from the list
				this.roomMembers.set(this.roomMembers().filter((m) => !deleted.includes(m.memberId)));
				this.notificationService.showSnackbar(
					`${deleted.length} member${deleted.length > 1 ? 's' : ''} removed successfully`
				);
			} catch (error: any) {
				this.log.e('Error removing members:', error);

				const deleted = (error?.error?.deleted ?? []) as string[];
				const failed = (error?.error?.failed ?? []) as { memberId: string; error: string }[];

				if (failed.length > 0 || deleted.length > 0) {
					if (deleted.length > 0) {
						this.roomMembers.set(this.roomMembers().filter((m) => !deleted.includes(m.memberId)));
					}

					let msg = '';
					if (deleted.length > 0) {
						msg += `${deleted.length} member${deleted.length > 1 ? 's' : ''} removed successfully. `;
					}
					if (failed.length > 0) {
						msg += `${failed.length} member${failed.length > 1 ? 's' : ''} could not be removed.`;
					}

					this.notificationService.showSnackbar(msg.trim());
				} else {
					this.notificationService.showSnackbar('Failed to remove members');
				}
			}
		};

		const count = members.length;
		this.notificationService.showDialog({
			title: 'Remove Members',
			icon: 'group_remove',
			message: `Are you sure you want to remove <b>${count} member${count > 1 ? 's' : ''}</b> from this room?`,
			confirmText: 'Remove',
			cancelText: 'Cancel',
			confirmCallback: bulkDeleteCallback
		});
	}

	// --- Recordings management ---

	private async loadRecordings(filters: RecordingTableFilter, refresh = false) {
		const delayLoader = setTimeout(() => {
			this.loadingRecordings.set(true);
		}, 200);

		try {
			const recordingFilters: MeetRecordingFilters = {
				roomId: this.roomId(),
				maxItems: 50,
				nextPageToken: !refresh ? this.nextRecordingsPageToken : undefined,
				sortField: filters.sortField,
				sortOrder: filters.sortOrder
			};

			// Apply status filter if provided
			if (filters.statusFilter) {
				recordingFilters.status = filters.statusFilter;
			}

			const response = await this.recordingService.listRecordings(recordingFilters);

			if (!refresh) {
				// Update recordings list
				this.recordings.set([...this.recordings(), ...response.recordings]);
			} else {
				// Replace recordings list
				this.recordings.set(response.recordings);
			}

			// Update pagination
			this.nextRecordingsPageToken = response.pagination.nextPageToken;
			this.hasMoreRecordings.set(response.pagination.isTruncated);
		} catch (error) {
			this.log.e('Error loading recordings:', error);
			this.notificationService.showSnackbar('Failed to load recordings');
		} finally {
			clearTimeout(delayLoader);
			this.loadingRecordings.set(false);
		}
	}

	async loadMoreRecordings(filters: RecordingTableFilter) {
		if (!this.hasMoreRecordings() || this.loadingRecordings()) return;
		await this.loadRecordings(filters);
	}

	async refreshRecordings(filters: RecordingTableFilter) {
		this.nextRecordingsPageToken = undefined;
		await this.loadRecordings(filters, true);
	}

	async onRecordingAction(action: RecordingTableAction) {
		switch (action.action) {
			case 'play':
				await this.playRecording(action.recordings[0]);
				break;
			case 'download':
				this.downloadRecording(action.recordings[0]);
				break;
			case 'shareLink':
				this.shareRecordingLink(action.recordings[0]);
				break;
			case 'delete':
				this.deleteRecording(action.recordings[0]);
				break;
			case 'bulkDelete':
				this.bulkDeleteRecordings(action.recordings);
				break;
			case 'bulkDownload':
				this.bulkDownloadRecordings(action.recordings);
				break;
		}
	}

	async onRecordingClick(recordingId: string) {
		try {
			await this.navigationService.navigateTo(`/recordings/${recordingId}`);
		} catch (error) {
			this.notificationService.showSnackbar('Error navigating to recording detail');
			this.log.e('Error navigating to recording detail:', error);
		}
	}

	private async playRecording(recording: MeetRecordingInfo) {
		await this.recordingService.playRecording(recording.recordingId);
	}

	private downloadRecording(recording: MeetRecordingInfo) {
		this.recordingService.downloadRecording(recording);
	}

	private shareRecordingLink(recording: MeetRecordingInfo) {
		this.recordingService.openShareRecordingDialog(recording.recordingId, true);
	}

	private deleteRecording(recording: MeetRecordingInfo) {
		const deleteCallback = async () => {
			try {
				await this.recordingService.deleteRecording(recording.recordingId);

				// Remove from local list
				this.recordings.set(this.recordings().filter((r) => r.recordingId !== recording.recordingId));
				this.notificationService.showSnackbar('Recording deleted successfully');
			} catch (error) {
				this.log.e('Error deleting recording:', error);
				this.notificationService.showSnackbar('Failed to delete recording');
			}
		};

		this.notificationService.showDialog({
			title: 'Delete Recording',
			icon: 'delete_outline',
			message: `Are you sure you want to permanently delete the recording <b>${recording.recordingId}</b>? This action cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			confirmCallback: deleteCallback
		});
	}

	private bulkDeleteRecordings(recordings: MeetRecordingInfo[]) {
		const bulkDeleteCallback = async () => {
			try {
				const recordingIds = recordings.map((r) => r.recordingId);
				const { deleted } = await this.recordingService.bulkDeleteRecordings(recordingIds);

				// Remove deleted recordings from the list
				this.recordings.set(this.recordings().filter((r) => !deleted.includes(r.recordingId)));
				this.notificationService.showSnackbar(
					`${deleted.length} recording${deleted.length > 1 ? 's' : ''} deleted successfully`
				);
			} catch (error: any) {
				this.log.e('Error deleting recordings:', error);

				const deleted = (error?.error?.deleted ?? []) as string[];
				const failed = (error?.error?.failed ?? []) as { recordingId: string; error: string }[];

				// Some recordings were deleted, some not
				if (failed.length > 0 || deleted.length > 0) {
					// Remove deleted recordings from the list
					if (deleted.length > 0) {
						this.recordings.set(this.recordings().filter((r) => !deleted.includes(r.recordingId)));
					}

					let msg = '';
					if (deleted.length > 0) {
						msg += `${deleted.length} recording${deleted.length > 1 ? 's' : ''} deleted successfully. `;
					}
					if (failed.length > 0) {
						msg += `${failed.length} recording${failed.length > 1 ? 's' : ''} could not be deleted.`;
					}

					this.notificationService.showSnackbar(msg.trim());
				} else {
					this.notificationService.showSnackbar('Failed to delete recordings');
				}
			}
		};

		const count = recordings.length;
		this.notificationService.showDialog({
			title: 'Delete Recordings',
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete <b>${count} recording${count > 1 ? 's' : ''}</b>? This action cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			confirmCallback: bulkDeleteCallback
		});
	}

	private bulkDownloadRecordings(recordings: MeetRecordingInfo[]) {
		const recordingIds = recordings.map((r) => r.recordingId);
		this.recordingService.downloadRecordingsAsZip(recordingIds);
	}
}
