import { Component, inject, OnDestroy, signal } from '@angular/core';
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
import { MeetRoomMemberOptions, MeetRoomMemberPermissions, MeetRoomMemberRole, MeetUserDTO } from '@openvidu-meet/typings';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { UserService } from '../../../../../users/services/user.service';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';
import { PERMISSION_GROUPS } from '../role-permissions/role-permissions.component';

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
export class RoomAccessComponent implements OnDestroy {
	private wizardService = inject(RoomWizardStateService);
	private userService = inject(UserService);

	roomAccessForm: FormGroup;
	permissionGroups = PERMISSION_GROUPS;
	readonly availableRoles: MeetRoomMemberRole[] = [MeetRoomMemberRole.MODERATOR, MeetRoomMemberRole.SPEAKER];

	// Member addition form
	addMemberForm = new FormGroup({
		userId: new FormControl<string>('', [Validators.required]),
		role: new FormControl<MeetRoomMemberRole>(MeetRoomMemberRole.SPEAKER, [Validators.required])
	});

	pendingMembers = this.wizardService.pendingMembers;
	isLoadingUsers = signal(false);
	filteredUsers = signal<MeetUserDTO[]>([]);

	private destroy$ = new Subject<void>();

	constructor() {
		const currentStep = this.wizardService.currentStep();
		this.roomAccessForm = currentStep!.formGroup;

		this.roomAccessForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});

		// User search autocomplete
		this.addMemberForm.get('userId')!.valueChanges
			.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
			.subscribe((value) => {
				if (value && value.length >= 1) {
					this.searchUsers(value);
				} else {
					this.filteredUsers.set([]);
				}
			});
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	get moderatorForm(): FormGroup {
		return this.roomAccessForm.get('moderator') as FormGroup;
	}

	get speakerForm(): FormGroup {
		return this.roomAccessForm.get('speaker') as FormGroup;
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

	getRoleLabel(role: MeetRoomMemberRole): string {
		switch (role) {
			case MeetRoomMemberRole.MODERATOR:
				return 'Moderator';
			case MeetRoomMemberRole.SPEAKER:
				return 'Speaker';
			default:
				return role;
		}
	}

	getRoleIcon(role: MeetRoomMemberRole): string {
		switch (role) {
			case MeetRoomMemberRole.MODERATOR:
				return 'manage_accounts';
			case MeetRoomMemberRole.SPEAKER:
				return 'record_voice_over';
			default:
				return 'person';
		}
	}

	private saveFormData(formValue: any): void {
		const buildPermissions = (roleValue: any): Partial<MeetRoomMemberPermissions> => {
			return roleValue as Partial<MeetRoomMemberPermissions>;
		};

		const stepData = {
			access: {
				anonymous: {
					moderator: { enabled: formValue.anonymousModeratorEnabled ?? false },
					speaker: { enabled: formValue.anonymousSpeakerEnabled ?? false }
				},
				registered: { enabled: formValue.registeredEnabled ?? true }
			},
			roles: {
				moderator: { permissions: buildPermissions(formValue.moderator) },
				speaker: { permissions: buildPermissions(formValue.speaker) }
			}
		};

		this.wizardService.updateStepData('roomAccess', stepData);
	}
}
