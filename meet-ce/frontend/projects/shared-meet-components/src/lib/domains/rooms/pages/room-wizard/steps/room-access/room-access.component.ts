import { Component, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
	MeetRoomConfig,
	MeetRoomMemberOptions,
	MeetRoomMemberPermissions,
	MeetRoomOptions,
	MeetRoomRoles
} from '@openvidu-meet/typings';
import { take } from 'rxjs';
import { AuthService } from '../../../../../auth/services/auth.service';
import { MemberFormDialogComponent } from '../../../../../room-members/components/member-form-dialog/member-form-dialog.component';
import { MemberFormDialogData } from '../../../../../room-members/models/member-form.model';
import { PERMISSION_GROUPS } from '../../../../../room-members/models/permissions.model';
import { RoomMemberUiUtils } from '../../../../../room-members/utils/ui';
import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';
import {
	RoomAccessFormGroup,
	RoomAccessFormValue,
	RoomAccessRolePermissionsFormGroup
} from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';

/**
 * Role permissions that only make sense when a given room feature is enabled. When the feature is
 * turned off in the Room Features step, these permissions are force-disabled in the Role permissions
 * section — they would have no effect in a room without that feature, and the user must not be able to
 * grant them. Angular's native enable()/disable() preserves each control's value, so re-enabling the
 * feature restores the permission exactly as the user left it ("keep as-is").
 */
const FEATURE_DEPENDENT_PERMISSIONS: {
	permissionKeys: (keyof MeetRoomMemberPermissions)[];
	isEnabled: (config: Partial<MeetRoomConfig> | undefined) => boolean;
}[] = [
	{
		permissionKeys: ['chatRead', 'chatWrite'],
		isEnabled: (config) => config?.chat?.enabled ?? false
	},
	{
		permissionKeys: ['mediaChangeVirtualBackground'],
		isEnabled: (config) => config?.virtualBackground?.enabled ?? false
	}
];

@Component({
	selector: 'ov-room-access',
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatSlideToggleModule,
		MatExpansionModule,
		MatTooltipModule,
		TranslatePipe
	],
	templateUrl: './room-access.component.html',
	styleUrl: './room-access.component.scss'
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

	// Permission keys whose toggle is disabled because the room feature they depend on is turned off.
	private readonly featureDisabledPermissions = new Set<keyof MeetRoomMemberPermissions>();

	constructor() {
		const roomAccessStep = this.wizardService.getStepById(WizardStepId.ROOM_ACCESS);

		if (!roomAccessStep) {
			throw new Error('roomAccess step not found in wizard state');
		}

		this.roomAccessForm = roomAccessStep.formGroup;

		// Disable role permissions whose room feature is off before wiring valueChanges, so the
		// disable() calls (emitEvent: false) don't trigger a save. The feature flags can't change while
		// this step is mounted — the Room Features step is a sibling @switch case that isn't rendered at
		// the same time — so applying the constraint once here is enough.
		this.applyFeatureConstraints();

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

	/**
	 * Enables/disables each role's feature-dependent permission controls to match the room features
	 * selected in the previous step. Uses the reactive form's own enable()/disable() so the control
	 * value is preserved across toggles and the bound mat-slide-toggle greys out automatically.
	 */
	private applyFeatureConstraints(): void {
		const config = this.wizardService.roomOptions().config;

		for (const { permissionKeys, isEnabled } of FEATURE_DEPENDENT_PERMISSIONS) {
			const enabled = isEnabled(config);

			for (const key of permissionKeys) {
				for (const roleForm of [this.moderatorForm, this.speakerForm]) {
					const control = roleForm.controls[key];

					if (enabled) {
						control.enable({ emitEvent: false });
					} else {
						control.disable({ emitEvent: false });
					}
				}

				if (enabled) {
					this.featureDisabledPermissions.delete(key);
				} else {
					this.featureDisabledPermissions.add(key);
				}
			}
		}
	}

	/** Whether this permission's toggle is disabled because the room feature it depends on is off. */
	isPermissionFeatureDisabled(key: keyof MeetRoomMemberPermissions): boolean {
		return this.featureDisabledPermissions.has(key);
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

				// Deduplicate by userId for users
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
				user: { enabled: formValue.userEnabled ?? false }
			},
			roles: {
				moderator: { permissions: formValue.moderator ?? {} },
				speaker: { permissions: formValue.speaker ?? {} }
			}
		};

		this.wizardService.updateStepData(stepData);
	}
}
