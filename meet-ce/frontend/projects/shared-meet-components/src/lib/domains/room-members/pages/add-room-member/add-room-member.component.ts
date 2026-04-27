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
	MeetRoom,
	MeetRoomMemberOptions,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomRoles,
	MeetUserDTO
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

	readonly permissionGroups = PERMISSION_GROUPS;
	protected readonly RoomMemberUiUtils = RoomMemberUiUtils;

	/** Role permissions as defined in the room, used to compute the diff on submit */
	private roomRoles: MeetRoomRoles | null = null;

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
			.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
			.subscribe((value) => {
				if (value && value.length >= 1) {
					this.searchUsers(value);
				} else {
					this.filteredUsers.set([]);
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

		try {
			const room: MeetRoom = await this.roomService.getRoom(roomId);
			this.roomRoles = room.roles;
			// Set initial permissions defaults for the initial role (SPEAKER)
			const initialRole = this.form.get('role')!.value!;
			this.resetPermissionsToRoleDefaults(initialRole);
		} catch {
			this.notificationService.showSnackbar('Failed to load room data');
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
		console.log('Custom permissions to submit:', customPermissions);

		const options: MeetRoomMemberOptions = {
			...(memberType === 'registered' ? { userId: userId! } : { name: memberName! }),
			baseRole: role!,
			customPermissions
		};

		this.isSaving.set(true);
		try {
			await this.roomMemberService.createRoomMember(this.roomId(), options);
			this.notificationService.showSnackbar('Member added successfully');
			await this.navigationService.navigateTo(`/rooms/${this.roomId()}`);
		} catch (error: any) {
			const msg = error?.error?.message ?? 'Failed to add member';
			this.notificationService.showSnackbar(msg);
		} finally {
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
