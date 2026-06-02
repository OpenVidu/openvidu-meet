import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { MeetRoomMember, MeetRoomMemberOptions, MeetRoomRoles } from '@openvidu-meet/typings';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RoomService } from '../../../rooms/services/room.service';
import { MemberFormComponent } from '../../components/member-form/member-form.component';
import { MemberFormMemberType } from '../../models/member-form.model';
import { RoomMemberService } from '../../services/room-member.service';
import { RoomMemberUiUtils } from '../../utils/ui';

@Component({
	selector: 'ov-add-room-member',
	imports: [MatCardModule, MatIconModule, MemberFormComponent],
	templateUrl: './add-room-member.component.html',
	styleUrl: './add-room-member.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddRoomMemberComponent implements OnInit {
	private route = inject(ActivatedRoute);
	private roomMemberService = inject(RoomMemberService);
	private roomService = inject(RoomService);
	private navigationService = inject(NavigationService);
	private notificationService = inject(NotificationService);

	roomId = '';
	isSaving = signal(false);
	isEditMode = signal(false);
	memberInitData = signal<MeetRoomMemberOptions | undefined>(undefined);
	memberType = signal<MemberFormMemberType>('registered');

	roomRoles = signal<MeetRoomRoles | undefined>(undefined);
	roomOwner = signal<string>('');
	private memberId = '';

	async ngOnInit(): Promise<void> {
		const roomId = this.route.snapshot.paramMap.get('room-id');
		if (!roomId) {
			this.notificationService.showSnackbar('Room ID is required');
			this.navigationService.navigateTo('/rooms');
			return;
		}
		this.roomId = roomId;

		const memberId = this.route.snapshot.paramMap.get('member-id');
		if (memberId) {
			this.isEditMode.set(true);
			this.memberId = memberId;
		}

		try {
			const [{ roles, owner }, member] = await Promise.all([
				// 'roles' is an extra field (excluded by default), so request it explicitly
				this.roomService.getRoom(roomId, { fields: ['roles', 'owner'], extraFields: ['roles'] }),
				memberId ? this.roomMemberService.getRoomMember(roomId, memberId) : Promise.resolve(null)
			]);
			this.roomRoles.set(roles);
			this.roomOwner.set(owner);

			if (member) {
				const options = this.buildMemberOptions(member);
				this.memberInitData.set(options);
				this.memberType.set(options.userId ? 'registered' : 'external');
			}
		} catch (error) {
			console.error(error);
			this.notificationService.showSnackbar('Failed to load room data');
		}
	}

	onMemberTypeChanged(type: MemberFormMemberType): void {
		this.memberType.set(type);
	}

	async onMemberSubmitted(options: MeetRoomMemberOptions): Promise<void> {
		const delayLoader = setTimeout(() => this.isSaving.set(true), 200);

		try {
			if (this.isEditMode()) {
				// Edit mode: update member
				await this.roomMemberService.updateRoomMember(this.roomId, this.memberId, {
					baseRole: options.baseRole,
					customPermissions: options.customPermissions ?? {} // Send empty object to clear custom permissions if they were removed in the UI
				});
				this.notificationService.showSnackbar('Member updated successfully');
			} else {
				// Add mode: create new member
				await this.roomMemberService.createRoomMember(this.roomId, options);
				this.notificationService.showSnackbar('Member added successfully');
			}

			await this.navigationService.navigateTo(`/rooms/${this.roomId}`, { tab: 'members' });
		} catch (error) {
			const msg = this.isEditMode() ? 'Failed to update member' : 'Failed to add member';
			this.notificationService.showSnackbar(msg);
			console.error(error);
		} finally {
			clearTimeout(delayLoader);
			this.isSaving.set(false);
		}
	}

	async onCancelled(): Promise<void> {
		await this.navigationService.navigateTo(`/rooms/${this.roomId}`, { tab: 'members' });
	}

	private buildMemberOptions(member: MeetRoomMember): MeetRoomMemberOptions {
		const isRegistered = RoomMemberUiUtils.isRegisteredMember(member);
		return {
			...(isRegistered ? { userId: member.memberId } : { name: member.name }),
			baseRole: member.baseRole,
			customPermissions: member.customPermissions
		};
	}
}
