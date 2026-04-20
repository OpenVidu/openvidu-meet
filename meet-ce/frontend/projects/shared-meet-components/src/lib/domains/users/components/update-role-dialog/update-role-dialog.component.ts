import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import {
	MAT_DIALOG_DATA,
	MatDialogActions,
	MatDialogContent,
	MatDialogRef,
	MatDialogTitle
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MeetUserDTO, MeetUserRole } from '@openvidu-meet/typings';
import { NotificationService } from '../../../../shared/services/notification.service';
import { UserService } from '../../services/user.service';
import { UsersUiUtils } from '../../utils/ui';

export interface UpdateRoleDialogData {
	user: MeetUserDTO;
}

@Component({
	selector: 'ov-update-role-dialog',
	imports: [
		FormsModule,
		MatButtonModule,
		MatIconModule,
		MatFormFieldModule,
		MatSelectModule,
		MatOptionModule,
		MatProgressSpinnerModule,
		MatDialogTitle,
		MatDialogContent,
		MatDialogActions
	],
	templateUrl: './update-role-dialog.component.html',
	styleUrl: './update-role-dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class UpdateRoleDialogComponent {
	readonly dialogRef = inject(MatDialogRef<UpdateRoleDialogComponent, MeetUserDTO | null>);
	readonly data: UpdateRoleDialogData = inject(MAT_DIALOG_DATA);

	private readonly userService = inject(UserService);
	private readonly notificationService = inject(NotificationService);

	readonly selectedRole = signal<MeetUserRole>(this.data.user.role);
	readonly isSaving = signal(false);
	readonly availableRoles: readonly MeetUserRole[] = UsersUiUtils.AVAILABLE_ROLES;
	protected readonly UsersUiUtils = UsersUiUtils;

	readonly roleSpecificWarning = computed(() => {
		switch (this.selectedRole()) {
			case MeetUserRole.ROOM_MEMBER:
				return 'If this user owns rooms, ownership will be transferred to the root admin.';
			case MeetUserRole.ADMIN:
				return 'All room memberships for this user will be removed because admins have direct access to all rooms.';
			default:
				return '';
		}
	});

	readonly roleChanged = computed(() => this.selectedRole() !== this.data.user.role);

	cancel() {
		this.dialogRef.close(null);
	}

	async save() {
		if (!this.roleChanged() || this.isSaving()) {
			return;
		}

		const delayLoader = setTimeout(() => this.isSaving.set(true), 200);

		try {
			const { user: updatedUser } = await this.userService.updateUserRole(
				this.data.user.userId,
				this.selectedRole()
			);
			this.notificationService.showSnackbar(
				`Role for ${updatedUser.name} updated to ${UsersUiUtils.getRoleLabel(updatedUser.role)}`
			);
			this.dialogRef.close(updatedUser);
		} catch (error) {
			console.error('Error while updating user role', error);
			this.notificationService.showSnackbar('Failed to update role');
		} finally {
			clearTimeout(delayLoader);
			this.isSaving.set(false);
		}
	}
}
