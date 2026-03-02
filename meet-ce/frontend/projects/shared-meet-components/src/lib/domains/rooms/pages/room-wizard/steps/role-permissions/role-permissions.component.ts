import { Component, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { Subject, takeUntil } from 'rxjs';
import { RoomWizardStateService } from '../../../../services';

export interface PermissionItem {
	key: keyof MeetRoomMemberPermissions;
	label: string;
	description: string;
	icon: string;
}

export interface PermissionGroup {
	label: string;
	icon: string;
	permissions: PermissionItem[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
	{
		label: 'Meeting',
		icon: 'groups',
		permissions: [
			{
				key: 'canJoinMeeting',
				label: 'Can join meeting',
				description: 'Allow joining the meeting',
				icon: 'login'
			},
			{
				key: 'canEndMeeting',
				label: 'Can end meeting',
				description: 'Allow ending the meeting for all participants',
				icon: 'meeting_room'
			},
			{
				key: 'canMakeModerator',
				label: 'Can make moderator',
				description: 'Allow promoting participants to moderator role',
				icon: 'manage_accounts'
			},
			{
				key: 'canKickParticipants',
				label: 'Can kick participants',
				description: 'Allow removing participants from the meeting',
				icon: 'person_remove'
			},
			{
				key: 'canShareAccessLinks',
				label: 'Can share access links',
				description: 'Allow sharing invite links with others',
				icon: 'link'
			}
		]
	},
	{
		label: 'Media',
		icon: 'perm_media',
		permissions: [
			{
				key: 'canPublishVideo',
				label: 'Can publish video',
				description: 'Allow sharing camera video',
				icon: 'videocam'
			},
			{
				key: 'canPublishAudio',
				label: 'Can publish audio',
				description: 'Allow sharing microphone audio',
				icon: 'mic'
			},
			{
				key: 'canShareScreen',
				label: 'Can share screen',
				description: 'Allow sharing desktop or browser tabs',
				icon: 'screen_share'
			},
			{
				key: 'canChangeVirtualBackground',
				label: 'Can change virtual background',
				description: 'Allow changing the virtual background',
				icon: 'background_replace'
			}
		]
	},
	{
		label: 'Recordings',
		icon: 'video_library',
		permissions: [
			{
				key: 'canRecord',
				label: 'Can record',
				description: 'Allow starting and stopping recordings',
				icon: 'fiber_manual_record'
			},
			{
				key: 'canRetrieveRecordings',
				label: 'Can retrieve recordings',
				description: 'Allow listing and playing recordings',
				icon: 'play_circle'
			},
			{
				key: 'canDeleteRecordings',
				label: 'Can delete recordings',
				description: 'Allow deleting recordings',
				icon: 'delete'
			}
		]
	},
	{
		label: 'Chat',
		icon: 'chat',
		permissions: [
			{
				key: 'canReadChat',
				label: 'Can read chat',
				description: 'Allow reading chat messages',
				icon: 'visibility'
			},
			{ key: 'canWriteChat', label: 'Can write chat', description: 'Allow sending chat messages', icon: 'edit' }
		]
	}
];

@Component({
	selector: 'ov-role-permissions',
	imports: [ReactiveFormsModule, MatCardModule, MatIconModule, MatSlideToggleModule, MatTabsModule],
	templateUrl: './role-permissions.component.html',
	styleUrl: './role-permissions.component.scss'
})
export class RolePermissionsComponent implements OnDestroy {
	rolePermissionsForm: FormGroup;
	permissionGroups = PERMISSION_GROUPS;

	private destroy$ = new Subject<void>();

	constructor(private wizardService: RoomWizardStateService) {
		const currentStep = this.wizardService.currentStep();
		this.rolePermissionsForm = currentStep!.formGroup;

		this.rolePermissionsForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	get moderatorForm(): FormGroup {
		return this.rolePermissionsForm.get('moderator') as FormGroup;
	}

	get speakerForm(): FormGroup {
		return this.rolePermissionsForm.get('speaker') as FormGroup;
	}

	private saveFormData(formValue: any): void {
		const buildPermissions = (roleValue: any): Partial<MeetRoomMemberPermissions> => {
			const { anonymousEnabled, ...perms } = roleValue;
			return perms as Partial<MeetRoomMemberPermissions>;
		};

		const stepData = {
			roles: {
				moderator: { permissions: buildPermissions(formValue.moderator) },
				speaker: { permissions: buildPermissions(formValue.speaker) }
			},
			access: {
				anonymous: {
					moderator: { enabled: formValue.moderator.anonymousEnabled ?? false },
					speaker: { enabled: formValue.speaker.anonymousEnabled ?? false }
				}
			}
		};

		this.wizardService.updateStepData('rolePermissions', stepData);
	}
}
