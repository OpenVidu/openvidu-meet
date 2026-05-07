import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetRoomMemberOptions, MeetRoomOptions, MeetRoomRoles } from '@openvidu-meet/typings';
import { take } from 'rxjs';
import { AuthService } from '../../../../../auth/services/auth.service';
import { MemberFormDialogComponent } from '../../../../../room-members/components/member-form-dialog/member-form-dialog.component';
import { MemberFormDialogData } from '../../../../../room-members/models/member-form.model';
import { PERMISSION_GROUPS } from '../../../../../room-members/models/permissions.model';
import { RoomMemberUiUtils } from '../../../../../room-members/utils/ui';
import {
	RoomAccessFormGroup,
	RoomAccessFormValue,
	RoomAccessRolePermissionsFormGroup
} from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';

@Component({
	selector: 'ov-room-access',
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatSlideToggleModule,
		MatExpansionModule,
		MatTooltipModule
	],
	templateUrl: './room-access.component.html',
	styleUrl: './room-access.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomAccessComponent implements OnInit {
	private wizardService = inject(RoomWizardStateService);
	private dialog = inject(MatDialog);
	private authService = inject(AuthService);

	currentUserId = signal('');

	roomAccessForm: RoomAccessFormGroup;
	permissionGroups = PERMISSION_GROUPS;
	protected readonly RoomMemberUiUtils = RoomMemberUiUtils;

	editMode = this.wizardService.editMode;
	pendingMembers = this.wizardService.pendingMembers;

	constructor() {
		const roomAccessStep = this.wizardService.getStepById(WizardStepId.ROOM_ACCESS);
		if (!roomAccessStep) {
			throw new Error('roomAccess step not found in wizard state');
		}
		this.roomAccessForm = roomAccessStep.formGroup;

		this.roomAccessForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	async ngOnInit(): Promise<void> {
		this.currentUserId.set((await this.authService.getUserId()) ?? '');
	}

	get moderatorForm(): RoomAccessRolePermissionsFormGroup {
		return this.roomAccessForm.controls.moderator;
	}

	get speakerForm(): RoomAccessRolePermissionsFormGroup {
		return this.roomAccessForm.controls.speaker;
	}

	openAddMemberDialog(): void {
		this.dialog
			.open<MemberFormDialogComponent, MemberFormDialogData, MeetRoomMemberOptions | null>(
				MemberFormDialogComponent,
				{
					data: {
						roomRoles: this.wizardService.roomOptions().roles as MeetRoomRoles,
						roomOwner: this.currentUserId()
					},
					width: '600px',
					maxWidth: '95vw',
					maxHeight: '90vh'
				}
			)
			.afterClosed()
			.pipe(take(1))
			.subscribe((result) => {
				if (!result) return;
				// Deduplicate by userId for registered members
				const isDuplicate = result.userId
					? this.pendingMembers().some((m) => m.userId === result.userId)
					: false;
				if (!isDuplicate) {
					this.wizardService.addPendingMember(result);
				}
			});
	}

	openEditMemberDialog(index: number): void {
		const member = this.pendingMembers()[index];
		if (!member) return;

		this.dialog
			.open<MemberFormDialogComponent, MemberFormDialogData, MeetRoomMemberOptions | null>(
				MemberFormDialogComponent,
				{
					data: {
						roomRoles: this.wizardService.roomOptions().roles as MeetRoomRoles,
						roomOwner: this.currentUserId(),
						initialData: member
					},
					width: '600px',
					maxWidth: '95vw',
					maxHeight: '90vh'
				}
			)
			.afterClosed()
			.pipe(take(1))
			.subscribe((result) => {
				if (result) {
					this.wizardService.updatePendingMember(index, result);
				}
			});
	}

	onRemoveMember(index: number): void {
		this.wizardService.removePendingMember(index);
	}

	private saveFormData(formValue: Partial<RoomAccessFormValue>): void {
		const stepData: Partial<MeetRoomOptions> = {
			access: {
				anonymous: {
					moderator: { enabled: formValue.anonymousModeratorEnabled ?? false },
					speaker: { enabled: formValue.anonymousSpeakerEnabled ?? false }
				},
				registered: { enabled: formValue.registeredEnabled ?? false }
			},
			roles: {
				moderator: { permissions: formValue.moderator ?? {} },
				speaker: { permissions: formValue.speaker ?? {} }
			}
		};

		this.wizardService.updateStepData(stepData);
	}
}
