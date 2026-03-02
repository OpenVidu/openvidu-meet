import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { MeetRoomMemberOptions, MeetRoomMemberPermissions, MeetRoomMemberRole, MeetUserDTO } from '@openvidu-meet/typings';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { UserService } from '../../../users/services/user.service';
import { PERMISSION_GROUPS } from '../../../rooms/pages/room-wizard/steps/role-permissions/role-permissions.component';
import { RoomMemberService } from '../../services/room-member.service';

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
		MatProgressSpinnerModule
	],
	templateUrl: './add-room-member.component.html',
	styleUrl: './add-room-member.component.scss'
})
export class AddRoomMemberComponent implements OnInit, OnDestroy {
	private route = inject(ActivatedRoute);
	private roomMemberService = inject(RoomMemberService);
	private userService = inject(UserService);
	private navigationService = inject(NavigationService);
	private notificationService = inject(NotificationService);

	private destroy$ = new Subject<void>();

	roomId = signal<string>('');
	isSaving = signal(false);
	isLoadingUsers = signal(false);
	filteredUsers = signal<MeetUserDTO[]>([]);

	readonly availableRoles: MeetRoomMemberRole[] = [MeetRoomMemberRole.MODERATOR, MeetRoomMemberRole.SPEAKER];
	readonly permissionGroups = PERMISSION_GROUPS;

	form = new FormGroup({
		userId: new FormControl<string>('', [Validators.required]),
		role: new FormControl<MeetRoomMemberRole>(MeetRoomMemberRole.SPEAKER, [Validators.required]),
		permissions: new FormGroup(
			Object.fromEntries(
				PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, new FormControl<boolean>(false)]))
			) as Record<keyof MeetRoomMemberPermissions, FormControl<boolean | null>>
		)
	});

	get permissionsForm(): FormGroup {
		return this.form.get('permissions') as FormGroup;
	}

	ngOnInit(): void {
		const roomId = this.route.snapshot.paramMap.get('roomId');
		if (!roomId) {
			this.notificationService.showSnackbar('Room ID is required');
			this.navigationService.navigateTo('/rooms');
			return;
		}
		this.roomId.set(roomId);

		// Set up autocomplete search reactive to userId input changes
		this.form.get('userId')!.valueChanges
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

		const { userId, role, permissions } = this.form.getRawValue();

		// Only include customPermissions if the user explicitly modified them
		let customPermissions: Partial<MeetRoomMemberPermissions> | undefined;
		if (this.permissionsForm.dirty && permissions) {
			customPermissions = {};
			for (const [key, val] of Object.entries(permissions)) {
				(customPermissions as any)[key] = val as boolean;
			}
		}

		const options: MeetRoomMemberOptions = {
			userId: userId!,
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
		return null;
	}
}
