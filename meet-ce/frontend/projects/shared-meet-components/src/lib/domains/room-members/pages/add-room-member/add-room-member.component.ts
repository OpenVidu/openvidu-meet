import { Component, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import {
	MEET_ROOM_MEMBER_PERMISSIONS_FIELDS,
	MeetRoomMember,
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
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RoomService } from '../../../rooms/services/room.service';
import { UserService } from '../../../users/services/user.service';
import { PERMISSION_GROUPS } from '../../models/permissions.model';
import { RoomMemberService } from '../../services/room-member.service';
import { RoomMemberUiUtils } from '../../utils/ui';

type MemberType = 'registered' | 'external';

@Component({
	selector: 'ov-add-room-member',
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatCardModule,
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
	templateUrl: './add-room-member.component.html',
	styleUrl: './add-room-member.component.scss'
})
export class AddRoomMemberComponent implements OnInit {
	private route = inject(ActivatedRoute);
	private roomMemberService = inject(RoomMemberService);
	private roomService = inject(RoomService);
	private userService = inject(UserService);
	private navigationService = inject(NavigationService);
	private notificationService = inject(NotificationService);

	roomId = signal<string>('');
	isSaving = signal(false);
	isLoadingUsers = signal(false);
	filteredUsers = signal<MeetUserDTO[]>([]);
	isRegisteredMode = signal(true);
	isEditMode = signal(false);

	readonly permissionGroups = PERMISSION_GROUPS;
	protected readonly RoomMemberUiUtils = RoomMemberUiUtils;

	/** Role permissions as defined in the room, used to compute the diff on submit */
	private roomRoles: MeetRoomRoles | null = null;
	private roomOwner = '';
	private memberId = '';

	form = new FormGroup({
		memberType: new FormControl<MemberType>('registered', { nonNullable: true }),
		userId: new FormControl<string>('', [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)]),
		memberName: new FormControl<string>({ value: '', disabled: true }, [
			Validators.required,
			Validators.maxLength(50)
		]),
		role: new FormControl<MeetRoomMemberRole>(MeetRoomMemberRole.SPEAKER, [Validators.required]),
		permissions: this.buildPermissionsFormGroup({})
	});

	constructor() {
		// Toggle active field when member type changes
		this.form
			.get('memberType')!
			.valueChanges.pipe(takeUntilDestroyed())
			.subscribe((type) => {
				const isRegistered = type === 'registered';
				this.isRegisteredMode.set(isRegistered);
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

		// Rebuild permissions defaults when role changes
		this.form
			.get('role')!
			.valueChanges.pipe(takeUntilDestroyed())
			.subscribe((role) => {
				if (this.roomRoles && role) {
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

	get permissionsForm(): FormGroup {
		return this.form.get('permissions') as FormGroup;
	}

	async ngOnInit(): Promise<void> {
		const roomId = this.route.snapshot.paramMap.get('room-id');
		if (!roomId) {
			this.notificationService.showSnackbar('Room ID is required');
			this.navigationService.navigateTo('/rooms');
			return;
		}
		this.roomId.set(roomId);

		const memberId = this.route.snapshot.paramMap.get('member-id');
		if (memberId) {
			this.isEditMode.set(true);
			this.memberId = memberId;
		}

		try {
			const [{ roles, owner }, member] = await Promise.all([
				this.roomService.getRoom(roomId, { fields: ['roles', 'owner'] }),
				memberId ? this.roomMemberService.getRoomMember(roomId, memberId) : Promise.resolve(null)
			]);
			this.roomRoles = roles;
			this.roomOwner = owner;

			const initialRole = member ? member.baseRole : this.form.get('role')!.value!;
			this.resetPermissionsToRoleDefaults(initialRole);

			if (member) {
				this.populateMemberForm(member);
			}
		} catch (error) {
			console.error(error);
			this.notificationService.showSnackbar('Failed to load room data');
		}
	}

	private populateMemberForm(member: MeetRoomMember): void {
		const isRegistered = RoomMemberUiUtils.isRegisteredMember(member);

		// Set role without emitting (resetPermissionsToRoleDefaults was already called)
		this.form.get('role')!.setValue(member.baseRole, { emitEvent: false });

		// Set member type — triggers the subscription that enables/disables userId/memberName
		this.form.get('memberType')!.setValue(isRegistered ? 'registered' : 'external');
		this.form.get('memberType')!.disable();

		if (isRegistered) {
			this.form.get('userId')!.setValue(member.memberId);
			this.form.get('userId')!.disable();
		} else {
			this.form.get('memberName')!.setValue(member.name);
			this.form.get('memberName')!.disable();
		}

		// Populate permissions from effectivePermissions
		const permissionsForm = this.permissionsForm;
		for (const key of MEET_ROOM_MEMBER_PERMISSIONS_FIELDS) {
			permissionsForm.get(key)?.setValue(member.effectivePermissions[key], { emitEvent: false });
		}

		// Mark dirty only if there are active custom permissions, so the diff is sent on submit
		if (member.customPermissions && Object.keys(member.customPermissions).length > 0) {
			permissionsForm.markAsDirty();
		} else {
			permissionsForm.markAsPristine();
		}
	}

	private buildPermissionsFormGroup(defaults: Partial<MeetRoomMemberPermissions>): FormGroup {
		const controls: Record<string, FormControl<boolean>> = {};
		for (const key of MEET_ROOM_MEMBER_PERMISSIONS_FIELDS) {
			controls[key] = new FormControl<boolean>(defaults[key] ?? false, {
				nonNullable: true
			}) as FormControl<boolean>;
		}
		return new FormGroup(controls);
	}

	private resetPermissionsToRoleDefaults(role: MeetRoomMemberRole): void {
		const rolePermissions =
			role === MeetRoomMemberRole.MODERATOR
				? this.roomRoles!.moderator.permissions
				: this.roomRoles!.speaker.permissions;

		const permissionsForm = this.permissionsForm;
		for (const key of MEET_ROOM_MEMBER_PERMISSIONS_FIELDS) {
			permissionsForm.get(key)?.setValue(rolePermissions[key], { emitEvent: false });
		}
		permissionsForm.markAsPristine();
	}

	onUserInputFocus(): void {
		const currentValue = this.form.get('userId')!.value || '';
		if (!currentValue) {
			this.searchUsers('');
		}
	}

	isUserDisabled(user: MeetUserDTO): boolean {
		return user.role === MeetUserRole.ADMIN || user.userId === this.roomOwner;
	}

	getDisabledReason(user: MeetUserDTO): string | null {
		if (user.role === MeetUserRole.ADMIN) {
			return 'Admin users cannot be added as room members';
		}
		if (user.userId === this.roomOwner) {
			return 'The room owner cannot be added as a member';
		}
		return null;
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

	displayUserFn(user: MeetUserDTO | string | null): string {
		if (!user) return '';
		if (typeof user === 'string') return user;
		return user.userId;
	}

	onUserSelected(userId: string): void {
		this.form.get('userId')!.setValue(userId);
	}

	async onSubmit(): Promise<void> {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		const { memberType, userId, memberName, role, permissions } = this.form.getRawValue();

		// Only send permissions that differ from the role's defaults in the room
		let customPermissions: Partial<MeetRoomMemberPermissions> | undefined;
		if (this.permissionsForm.dirty && permissions && this.roomRoles && role) {
			const roleDefaults =
				role === MeetRoomMemberRole.MODERATOR
					? this.roomRoles.moderator.permissions
					: this.roomRoles.speaker.permissions;

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

		const delayLoader = setTimeout(() => this.isSaving.set(true), 200);

		try {
			if (this.isEditMode()) {
				// Edit mode: update member
				const updateOptions = {
					baseRole: role!,
					customPermissions: customPermissions ?? {} // Send empty object to clear custom permissions if they were removed in the UI
				};
				await this.roomMemberService.updateRoomMember(this.roomId(), this.memberId, updateOptions);
				this.notificationService.showSnackbar('Member updated successfully');
			} else {
				// Add mode: create member
				const addOptions: MeetRoomMemberOptions = {
					...(memberType === 'registered' ? { userId: userId! } : { name: memberName! }),
					baseRole: role!,
					customPermissions
				};
				await this.roomMemberService.createRoomMember(this.roomId(), addOptions);
				this.notificationService.showSnackbar('Member added successfully');
			}

			await this.navigationService.navigateTo(`/rooms/${this.roomId()}`);
		} catch (error) {
			const msg = this.isEditMode() ? 'Failed to update member' : 'Failed to add member';
			this.notificationService.showSnackbar(msg);
			console.error(error);
		} finally {
			clearTimeout(delayLoader);
			this.isSaving.set(false);
		}
	}

	async onCancel(): Promise<void> {
		await this.navigationService.navigateTo(`/rooms/${this.roomId()}`);
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
}
