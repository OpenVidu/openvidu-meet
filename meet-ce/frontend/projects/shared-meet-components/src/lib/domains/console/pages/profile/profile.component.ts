import { NgClass } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import {
	AbstractControl,
	FormControl,
	FormGroup,
	ReactiveFormsModule,
	ValidationErrors,
	Validators
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { MeetUserDTO, MeetUserRole } from '@openvidu-meet/typings';
import { NotificationService } from '../../../../shared/services/notification.service';
import { AuthService } from '../../../auth/services/auth.service';
import { UserService } from '../../../users/services/user.service';

/** The userId of the non-deletable root admin (matches the backend default INITIAL_ADMIN_USER) */
const ROOT_ADMIN_USER_ID = 'admin';

@Component({
	selector: 'ov-profile',
	imports: [
		NgClass,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatSelectModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatDividerModule,
		ReactiveFormsModule
	],
	templateUrl: './profile.component.html',
	styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
	isLoading = signal(true);
	isOwnProfile = signal(true);
	isAdminViewing = signal(false);
	isRootAdmin = signal(false);

	showCurrentPassword = signal(false);
	showNewPassword = signal(false);
	showConfirmPassword = signal(false);

	isSavingPassword = signal(false);
	isDeletingUser = signal(false);
	isSavingRole = signal(false);

	targetUser = signal<MeetUserDTO | null>(null);
	editableRole = signal<MeetUserRole | null>(null);

	availableRoles: MeetUserRole[] = [MeetUserRole.ADMIN, MeetUserRole.USER];

	changePasswordForm = new FormGroup({
		currentPassword: new FormControl('', [Validators.required]),
		newPassword: new FormControl('', [Validators.required, Validators.minLength(5)]),
		confirmPassword: new FormControl('', [Validators.required])
	});

	constructor(
		private authService: AuthService,
		private userService: UserService,
		private notificationService: NotificationService,
		private route: ActivatedRoute
	) {
		// Clear invalid password error when user types on current password
		this.changePasswordForm.get('currentPassword')?.valueChanges.subscribe(() => {
			const control = this.changePasswordForm.get('currentPassword');
			if (control?.errors?.['invalidPassword']) {
				const errors = { ...control.errors };
				delete errors['invalidPassword'];
				control.setErrors(Object.keys(errors).length > 0 ? errors : null);
			}

			const newPasswordControl = this.changePasswordForm.get('newPassword');
			if (newPasswordControl?.value) {
				newPasswordControl.updateValueAndValidity();
			}
		});

		// Revalidate confirm password when new password changes
		this.changePasswordForm.get('newPassword')?.valueChanges.subscribe(() => {
			const confirmPasswordControl = this.changePasswordForm.get('confirmPassword');
			if (confirmPasswordControl?.value) {
				confirmPasswordControl.updateValueAndValidity();
			}
		});
	}

	async ngOnInit() {
		this.isLoading.set(true);

		// Add custom validators
		this.changePasswordForm.get('newPassword')?.addValidators(this.newPasswordValidator.bind(this));
		this.changePasswordForm.get('confirmPassword')?.addValidators(this.confirmPasswordValidator.bind(this));

		const queryUserId = this.route.snapshot.queryParamMap.get('userId');
		const authenticatedUserId = await this.authService.getUserId();
		const isAdmin = await this.authService.isAdmin();

		try {
			if (queryUserId && queryUserId !== authenticatedUserId) {
				// Admin viewing another user's profile
				if (!isAdmin) {
					// Non-admin trying to access another user's profile - redirect to own profile
					this.notificationService.showSnackbar('You do not have permission to view this profile');
					const user = await this.userService.getMe();
					this.targetUser.set(user);
					this.isOwnProfile.set(true);
					this.isAdminViewing.set(false);
				} else {
					const user = await this.userService.getUser(queryUserId);
					this.targetUser.set(user);
					this.isOwnProfile.set(false);
					this.isAdminViewing.set(true);
					this.isRootAdmin.set(user.userId === ROOT_ADMIN_USER_ID);
					this.editableRole.set(user.role);
				}
			} else {
				// Own profile
				const user = await this.userService.getMe();
				this.targetUser.set(user);
				this.isOwnProfile.set(true);
				this.isAdminViewing.set(false);
			}
		} catch (error) {
			console.error('Error loading profile:', error);
			this.notificationService.showSnackbar('Failed to load user profile');
		} finally {
			this.isLoading.set(false);
		}
	}

	// ─── Password validators ────────────────────────────────────────────────────

	private newPasswordValidator(control: AbstractControl): ValidationErrors | null {
		const currentPassword = this.changePasswordForm?.get('currentPassword')?.value;
		const newPassword = control.value;
		if (!currentPassword || !newPassword) return null;
		return currentPassword === newPassword ? { samePassword: true } : null;
	}

	private confirmPasswordValidator(control: AbstractControl): ValidationErrors | null {
		const newPassword = this.changePasswordForm?.get('newPassword')?.value;
		const confirmPassword = control.value;
		if (!newPassword || !confirmPassword) return null;
		return newPassword === confirmPassword ? null : { passwordMismatch: true };
	}

	// ─── Change password ────────────────────────────────────────────────────────

	async onChangePassword() {
		if (this.changePasswordForm.invalid) return;

		const { currentPassword, newPassword } = this.changePasswordForm.value;
		this.isSavingPassword.set(true);

		try {
			await this.userService.changePassword(currentPassword!, newPassword!);
			this.notificationService.showSnackbar('Password updated successfully');

			this.changePasswordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
			this.showCurrentPassword.set(false);
			this.showNewPassword.set(false);
			this.showConfirmPassword.set(false);
		} catch (error) {
			console.error('Error changing password:', error);
			if ((error as HttpErrorResponse).status === 400) {
				const control = this.changePasswordForm.get('currentPassword');
				control?.setErrors({ invalidPassword: true });
				control?.markAsTouched();
				this.notificationService.showSnackbar('Current password is incorrect');
			} else {
				this.notificationService.showSnackbar('Failed to update password');
			}
		} finally {
			this.isSavingPassword.set(false);
		}
	}

	// ─── Admin actions ──────────────────────────────────────────────────────────

	async onUpdateRole() {
		const user = this.targetUser();
		const newRole = this.editableRole();
		if (!user || !newRole || newRole === user.role) return;

		this.isSavingRole.set(true);
		try {
			const updated = await this.userService.updateUserRole(user.userId, newRole);
			this.targetUser.set(updated);
			this.notificationService.showSnackbar(`Role updated to ${newRole}`);
		} catch (error) {
			console.error('Error updating role:', error);
			this.notificationService.showSnackbar('Failed to update role');
			this.editableRole.set(user.role); // revert
		} finally {
			this.isSavingRole.set(false);
		}
	}

	async onResetPassword() {
		const user = this.targetUser();
		if (!user) return;

		const tempPassword = this.generateTemporaryPassword();
		try {
			await this.userService.resetUserPassword(user.userId, tempPassword);
			this.notificationService.showSnackbar(
				`Password reset. Temporary password: ${tempPassword}`,
				10000
			);
		} catch (error) {
			console.error('Error resetting password:', error);
			this.notificationService.showSnackbar('Failed to reset password');
		}
	}

	async onDeleteUser() {
		const user = this.targetUser();
		if (!user) return;

		this.isDeletingUser.set(true);
		try {
			await this.userService.deleteUser(user.userId);
			this.notificationService.showSnackbar(`User '${user.userId}' deleted`);
			// Navigate back
			history.back();
		} catch (error) {
			console.error('Error deleting user:', error);
			this.notificationService.showSnackbar('Failed to delete user');
		} finally {
			this.isDeletingUser.set(false);
		}
	}

	// ─── Error helpers ──────────────────────────────────────────────────────────

	getCurrentPasswordError(): string | null {
		const control = this.changePasswordForm.get('currentPassword');
		if (control?.errors && control.touched) {
			if (control.errors['required']) return 'Current password is required';
			if (control.errors['invalidPassword']) return 'Current password is incorrect';
		}
		return null;
	}

	getNewPasswordError(): string | null {
		const control = this.changePasswordForm.get('newPassword');
		if (control?.errors && control.touched) {
			const errors = control.errors;
			if (errors['required']) return 'New password is required';
			if (errors['minlength']) return `Password must be at least ${errors['minlength'].requiredLength} characters long`;
			if (errors['samePassword']) return 'New password must be different from current password';
		}
		return null;
	}

	getConfirmPasswordError(): string | null {
		const control = this.changePasswordForm.get('confirmPassword');
		if (control?.touched && control?.errors) {
			if (control.errors['required']) return 'Please confirm your password';
			if (control.errors['passwordMismatch']) return 'Passwords do not match';
		}
		return null;
	}

	// ─── Utilities ──────────────────────────────────────────────────────────────

	/** Returns up to two uppercase initials derived from the user's name. */
	getInitials(): string {
		const name = this.targetUser()?.name ?? '';
		return name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0].toUpperCase())
			.join('');
	}

	formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	getRoleLabel(role: MeetUserRole): string {
		switch (role) {
			case MeetUserRole.ADMIN:
				return 'Admin';
			case MeetUserRole.USER:
				return 'User';
			case MeetUserRole.ROOM_MEMBER:
				return 'Room Member';
			default:
				return role;
		}
	}

	private generateTemporaryPassword(): string {
		const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
		return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
	}
}
