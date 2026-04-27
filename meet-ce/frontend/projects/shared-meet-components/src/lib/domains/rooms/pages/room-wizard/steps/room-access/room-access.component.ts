import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetRoomMemberOptions, MeetRoomMemberRole, MeetRoomOptions, MeetUserDTO } from '@openvidu-meet/typings';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { PERMISSION_GROUPS } from '../../../../../room-members/models/permissions.model';
import { RoomMemberUiUtils } from '../../../../../room-members/utils/ui';
import { UserService } from '../../../../../users/services/user.service';
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
		MatFormFieldModule,
		MatInputModule,
		MatSelectModule,
		MatAutocompleteModule,
		MatProgressSpinnerModule,
		MatChipsModule,
		MatTooltipModule
	],
	templateUrl: './room-access.component.html',
	styleUrl: './room-access.component.scss'
})
export class RoomAccessComponent {
	private wizardService = inject(RoomWizardStateService);
	private userService = inject(UserService);

	roomAccessForm: RoomAccessFormGroup;
	permissionGroups = PERMISSION_GROUPS;
	protected readonly RoomMemberUiUtils = RoomMemberUiUtils;

	// Member addition form
	addMemberForm = new FormGroup({
		userId: new FormControl<string>('', [Validators.required]),
		role: new FormControl<MeetRoomMemberRole>(MeetRoomMemberRole.SPEAKER, [Validators.required])
	});

	pendingMembers = this.wizardService.pendingMembers;
	isLoadingUsers = signal(false);
	filteredUsers = signal<MeetUserDTO[]>([]);

	constructor() {
		const roomAccessStep = this.wizardService.getStepById(WizardStepId.ROOM_ACCESS);
		if (!roomAccessStep) {
			throw new Error('roomAccess step not found in wizard state');
		}
		this.roomAccessForm = roomAccessStep.formGroup;

		this.roomAccessForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
			this.saveFormData(value);
		});

		// User search autocomplete
		this.addMemberForm
			.get('userId')!
			.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
			.subscribe((value) => {
				if (value && value.length >= 1) {
					this.searchUsers(value);
				} else {
					this.filteredUsers.set([]);
				}
			});
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

	get moderatorForm(): RoomAccessRolePermissionsFormGroup {
		return this.roomAccessForm.controls.moderator;
	}

	get speakerForm(): RoomAccessRolePermissionsFormGroup {
		return this.roomAccessForm.controls.speaker;
	}

	private async searchUsers(query: string): Promise<void> {
		this.isLoadingUsers.set(true);
		try {
			const response = await this.userService.listUsers({ userId: query, maxItems: 20 });
			this.filteredUsers.set(response.users);
		} catch {
			this.filteredUsers.set([]);
		} finally {
			this.isLoadingUsers.set(false);
		}
	}

	displayUserFn(user: MeetUserDTO | string | null): string {
		if (!user) return '';
		if (typeof user === 'string') return user;
		return user.userId;
	}

	onUserSelected(userId: string): void {
		this.addMemberForm.get('userId')!.setValue(userId, { emitEvent: false });
		this.filteredUsers.set([]);
	}

	onAddMember(): void {
		if (this.addMemberForm.invalid) {
			this.addMemberForm.markAllAsTouched();
			return;
		}

		const { userId, role } = this.addMemberForm.getRawValue();
		if (!userId || !role) return;

		// Avoid duplicates
		const exists = this.pendingMembers().some((m) => m.userId === userId);
		if (exists) return;

		const member: MeetRoomMemberOptions = { userId, baseRole: role };
		this.wizardService.addPendingMember(member);

		// Reset form
		this.addMemberForm.reset({
			userId: '',
			role: MeetRoomMemberRole.SPEAKER
		});
		this.filteredUsers.set([]);
	}

	onRemoveMember(index: number): void {
		this.wizardService.removePendingMember(index);
	}
}
