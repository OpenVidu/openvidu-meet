import { ChangeDetectionStrategy, Component, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
	MEET_ROOM_MEMBER_PERMISSIONS_FIELDS,
	MeetRoomMemberOptions,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomRoles,
	MeetUserDTO,
	MeetUserFilters,
	MeetUserRole,
	SortOrder,
	TextMatchMode
} from '@openvidu-meet/typings';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { UserService } from '../../../users/services/user.service';
import { MemberFormMemberType } from '../../models/member-form.model';
import { PERMISSION_GROUPS } from '../../models/permissions.model';
import { RoomMemberUiUtils } from '../../utils/ui';

@Component({
	selector: 'ov-member-form',
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatSelectModule,
		MatAutocompleteModule,
		MatExpansionModule,
		MatSlideToggleModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatRadioModule
	],
	templateUrl: './member-form.component.html',
	styleUrl: './member-form.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MemberFormComponent implements OnInit {
	private userService = inject(UserService);

	// ── Inputs ────────────────────────────────────────────────────────────────
	roomRoles = input.required<MeetRoomRoles>();
	roomOwner = input.required<string>();
	initialData = input<MeetRoomMemberOptions | undefined>(undefined);
	lockIdentity = input<boolean>(false);
	isSaving = input<boolean>(false);

	// ── Outputs ───────────────────────────────────────────────────────────────
	memberSubmitted = output<MeetRoomMemberOptions>();
	memberTypeChanged = output<MemberFormMemberType>();
	cancelled = output<void>();

	// ── State ─────────────────────────────────────────────────────────────────
	readonly permissionGroups = PERMISSION_GROUPS;
	protected readonly RoomMemberUiUtils = RoomMemberUiUtils;

	isRegisteredMode = signal(true);
	isLoadingUsers = signal(false);
	filteredUsers = signal<MeetUserDTO[]>([]);

	// ── Form ──────────────────────────────────────────────────────────────────
	form = new FormGroup({
		memberType: new FormControl<MemberFormMemberType>('registered', { nonNullable: true }),
		userId: new FormControl<string>('', [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)]),
		memberName: new FormControl<string>({ value: '', disabled: true }, [
			Validators.required,
			Validators.maxLength(50)
		]),
		role: new FormControl<MeetRoomMemberRole>(MeetRoomMemberRole.SPEAKER, [Validators.required]),
		permissions: this.buildPermissionsFormGroup()
	});

	constructor() {
		// Toggle active field when member type changes
		this.form
			.get('memberType')!
			.valueChanges.pipe(takeUntilDestroyed())
			.subscribe((type) => {
				const isRegistered = type === 'registered';
				this.isRegisteredMode.set(isRegistered);
				this.memberTypeChanged.emit(type);
				if (isRegistered) {
					this.form.get('userId')!.enable();
					this.form.get('memberName')!.disable();
					this.form.get('memberName')!.reset('');
				} else {
					this.form.get('memberName')!.enable();
					this.form.get('userId')!.disable();
					this.form.get('userId')!.reset('');
					this.filteredUsers.set([]);
				}
			});

		// Reset permissions to role defaults when role changes
		this.form
			.get('role')!
			.valueChanges.pipe(takeUntilDestroyed())
			.subscribe((role) => {
				if (role) {
					this.resetPermissionsToRoleDefaults(role);
				}
			});

		// Autocomplete search for registered users
		this.form
			.get('userId')!
			.valueChanges.pipe(debounceTime(500), distinctUntilChanged(), takeUntilDestroyed())
			.subscribe((value) => {
				if (value && value.length >= 1) {
					this.searchUsers(value);
				} else {
					this.searchUsers('');
				}
			});
	}

	ngOnInit(): void {
		const data = this.initialData();
		if (data) {
			this.applyInitialData(data);
		} else {
			// Set default permissions based on default role
			const defaultRole = this.form.get('role')!.value!;
			this.resetPermissionsToRoleDefaults(defaultRole);
		}
	}

	// ── Public Getters ────────────────────────────────────────────────────────

	get permissionsForm(): FormGroup {
		return this.form.get('permissions') as FormGroup;
	}

	// ── Autocomplete Handlers ─────────────────────────────────────────────────

	onUserInputFocus(): void {
		const currentValue = this.form.get('userId')!.value || '';
		if (!currentValue) {
			this.searchUsers('');
		}
	}

	isUserDisabled(user: MeetUserDTO): boolean {
		return user.role === MeetUserRole.ADMIN || user.userId === this.roomOwner();
	}

	getDisabledReason(user: MeetUserDTO): string | null {
		if (user.role === MeetUserRole.ADMIN) {
			return 'Admin users cannot be added as members';
		}
		if (user.userId === this.roomOwner()) {
			return 'The room owner cannot be added as a member';
		}
		return null;
	}

	displayUserFn(user: MeetUserDTO | string | null): string {
		if (!user) return '';
		if (typeof user === 'string') return user;
		return user.userId;
	}

	onUserSelected(userId: string): void {
		this.form.get('userId')!.setValue(userId);
	}

	// ── Form Actions ──────────────────────────────────────────────────────────

	onSubmit(): void {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		const { memberType, userId, memberName, role, permissions } = this.form.getRawValue();
		const roles = this.roomRoles();

		// Only send permissions that differ from the role's defaults
		let customPermissions: Partial<MeetRoomMemberPermissions> | undefined;
		if (this.permissionsForm.dirty && permissions && role) {
			const roleDefaults =
				role === MeetRoomMemberRole.MODERATOR ? roles.moderator.permissions : roles.speaker.permissions;

			const diff: Partial<MeetRoomMemberPermissions> = {};
			for (const key of MEET_ROOM_MEMBER_PERMISSIONS_FIELDS) {
				if (permissions[key] !== roleDefaults[key]) {
					diff[key] = permissions[key] as boolean;
				}
			}
			if (Object.keys(diff).length > 0) {
				customPermissions = diff;
			}
		}

		const options: MeetRoomMemberOptions = {
			...(memberType === 'registered' ? { userId: userId! } : { name: memberName! }),
			baseRole: role!,
			customPermissions
		};

		this.memberSubmitted.emit(options);
	}

	onCancel(): void {
		this.cancelled.emit();
	}

	getFieldError(field: string): string | null {
		const control = this.form.get(field);
		if (!control?.errors || !control.touched) return null;
		if (control.errors['required']) return 'This field is required';
		if (control.errors['pattern']) return 'Only lowercase letters, numbers, and underscores are allowed';
		if (control.errors['maxlength']) {
			const { requiredLength } = control.errors['maxlength'];
			return `Cannot exceed ${requiredLength} characters`;
		}
		return null;
	}

	// ── Private Helpers ───────────────────────────────────────────────────────

	private applyInitialData(options: MeetRoomMemberOptions): void {
		const role = options.baseRole;
		const memberType: MemberFormMemberType = options.userId ? 'registered' : 'external';
		const lockIdentity = this.lockIdentity();

		// Set role without emitting (prevents premature permission reset)
		this.form.get('role')!.setValue(role, { emitEvent: false });

		// Set member type — triggers the subscription that enables/disables fields
		this.form.get('memberType')!.setValue(memberType);

		if (lockIdentity) {
			this.form.get('memberType')!.disable();
		}

		if (memberType === 'registered') {
			this.form.get('userId')!.setValue(options.userId ?? '');
			if (lockIdentity) {
				this.form.get('userId')!.disable();
			}
		} else {
			this.form.get('memberName')!.setValue(options.name ?? '');
			if (lockIdentity) {
				this.form.get('memberName')!.disable();
			}
		}

		// Resolve permissions: role defaults + custom overrides
		const roles = this.roomRoles();
		const roleDefaults =
			role === MeetRoomMemberRole.MODERATOR ? roles.moderator.permissions : roles.speaker.permissions;

		const permissionsForm = this.permissionsForm;
		for (const key of MEET_ROOM_MEMBER_PERMISSIONS_FIELDS) {
			const value = options.customPermissions?.[key] ?? roleDefaults[key] ?? false;
			permissionsForm.get(key)?.setValue(value, { emitEvent: false });
		}

		// Mark dirty only if there are active custom permissions (differ from role defaults)
		if (options.customPermissions && Object.keys(options.customPermissions).length > 0) {
			permissionsForm.markAsDirty();
		} else {
			permissionsForm.markAsPristine();
		}
	}

	private buildPermissionsFormGroup(): FormGroup {
		const controls: Record<string, FormControl<boolean>> = {};
		for (const key of MEET_ROOM_MEMBER_PERMISSIONS_FIELDS) {
			controls[key] = new FormControl<boolean>(false, {
				nonNullable: true
			}) as FormControl<boolean>;
		}
		return new FormGroup(controls);
	}

	private resetPermissionsToRoleDefaults(role: MeetRoomMemberRole): void {
		const roomRoles = this.roomRoles();
		const rolePermissions =
			role === MeetRoomMemberRole.MODERATOR ? roomRoles.moderator.permissions : roomRoles.speaker.permissions;

		const permissionsForm = this.permissionsForm;
		for (const key of MEET_ROOM_MEMBER_PERMISSIONS_FIELDS) {
			permissionsForm.get(key)?.setValue(rolePermissions[key] ?? false, { emitEvent: false });
		}
		permissionsForm.markAsPristine();
	}

	private async searchUsers(query: string): Promise<void> {
		const delayLoader = setTimeout(() => this.isLoadingUsers.set(true), 200);

		try {
			const filters: MeetUserFilters = {
				maxItems: 20,
				sortField: 'name',
				sortOrder: SortOrder.ASC
			};
			if (query) {
				filters.name = query;
				filters.userId = query;
				filters.nameMatchMode = TextMatchMode.PREFIX;
				filters.nameCaseInsensitive = true;
			}

			const response = await this.userService.listUsers(filters);
			this.filteredUsers.set(response.users);
		} catch {
			this.filteredUsers.set([]);
		} finally {
			clearTimeout(delayLoader);
			this.isLoadingUsers.set(false);
		}
	}
}
