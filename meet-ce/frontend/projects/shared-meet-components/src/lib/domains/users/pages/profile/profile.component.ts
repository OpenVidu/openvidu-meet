import { NgClass } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
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
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { MeetUserDTO } from '@openvidu-meet/typings';
import { firstValueFrom } from 'rxjs';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { TokenStorageService } from '../../../../shared/services/token-storage.service';
import { AuthService } from '../../../auth/services/auth.service';
import { ResetPasswordDialogComponent } from '../../components/reset-password-dialog/reset-password-dialog.component';
import { UpdateRoleDialogComponent } from '../../components/update-role-dialog/update-role-dialog.component';
import { UserService } from '../../services/user.service';
import { UsersUiUtils } from '../../utils/ui';

@Component({
	selector: 'ov-profile',
	imports: [
		NgClass,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatDividerModule,
		ReactiveFormsModule
	],
	templateUrl: './profile.component.html',
	styleUrl: './profile.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileComponent implements OnInit {
	private authService = inject(AuthService);
	private userService = inject(UserService);
	private notificationService = inject(NotificationService);
	private route = inject(ActivatedRoute);
	private tokenStorageService = inject(TokenStorageService);
	private navigationService = inject(NavigationService);
	private dialog = inject(MatDialog);

	isLoading = signal(true);
	isOwnProfile = signal(true);
	isAdminViewing = signal(false);
	isRootAdmin = signal(false);
	isMandatoryChangePasswordMode = signal(false);

	showCurrentPassword = signal(false);
	showNewPassword = signal(false);
	showConfirmPassword = signal(false);

	isSavingPassword = signal(false);

	targetUser = signal<MeetUserDTO | null>(null);
	protected readonly UsersUiUtils = UsersUiUtils;

	changePasswordForm = new FormGroup({
		currentPassword: new FormControl('', [Validators.required]),
		newPassword: new FormControl('', [Validators.required, Validators.minLength(5)]),
		confirmPassword: new FormControl('', [Validators.required])
	});

	async ngOnInit() {
		this.isLoading.set(true);
		this.setupPasswordFormValidationListeners();
		this.isMandatoryChangePasswordMode.set(
			this.route.snapshot.queryParamMap.get('mandatoryChangePassword') === 'true'
		);

		// Add custom validators
		this.changePasswordForm.get('newPassword')?.addValidators(this.newPasswordValidator.bind(this));
		this.changePasswordForm.get('confirmPassword')?.addValidators(this.confirmPasswordValidator.bind(this));

		const userId = this.route.snapshot.paramMap.get('user-id');
		const authenticatedUserId = await this.authService.getUserId();
		const isAdmin = await this.authService.isAdmin();

		// Redirect to profile page if user tries to access their own profile through /users/:userId route
		if (userId && userId === authenticatedUserId) {
			await this.navigationService.navigateTo('/profile');
			return;
		}

		try {
			if (userId && userId !== authenticatedUserId) {
				// Admin viewing another user's profile
				if (isAdmin) {
					this.isAdminViewing.set(true);
				}

				const user = await this.userService.getUser(userId);
				this.targetUser.set(user);
				this.isOwnProfile.set(false);
				this.isRootAdmin.set(UsersUiUtils.isRootAdmin(user));
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
			await this.navigationService.navigateTo('/users', {}, true);
		} finally {
			this.isLoading.set(false);
		}
	}

	private setupPasswordFormValidationListeners() {
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
		const delayLoader = setTimeout(() => this.isSavingPassword.set(true), 200);

		try {
			const response = await this.userService.changePassword(currentPassword!, newPassword!);

			this.changePasswordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
			this.showCurrentPassword.set(false);
			this.showNewPassword.set(false);
			this.showConfirmPassword.set(false);

			if (this.isMandatoryChangePasswordMode()) {
				if (!response.accessToken) {
					throw new Error('No renewed access token received after mandatory password change');
				}

				this.tokenStorageService.setAccessToken(response.accessToken);
				if (response.refreshToken) {
					this.tokenStorageService.setRefreshToken(response.refreshToken);
				}

				this.notificationService.showSnackbar('Password updated successfully');
				await this.navigationService.navigateTo('/', {}, true);
				return;
			}

			this.notificationService.showSnackbar('Password updated successfully');
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
			clearTimeout(delayLoader);
			this.isSavingPassword.set(false);
		}
	}

	// ─── Admin actions ──────────────────────────────────────────────────────────

	async onUpdateRole() {
		const user = this.targetUser();
		if (!user) {
			return;
		}

		const updatedUser = await firstValueFrom(
			this.dialog
				.open(UpdateRoleDialogComponent, {
					width: '520px',
					data: { user },
					panelClass: 'ov-meet-dialog'
				})
				.afterClosed()
		);

		if (!updatedUser) {
			return;
		}

		this.targetUser.set(updatedUser);
	}

	async onResetPassword() {
		const user = this.targetUser();
		if (!user) return;

		this.dialog.open(ResetPasswordDialogComponent, {
			width: '520px',
			data: { user },
			panelClass: 'ov-meet-dialog'
		});
	}

	async onDeleteUser() {
		const user = this.targetUser();
		if (!user) return;

		this.notificationService.showDialog({
			title: 'Delete User',
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete user <strong>${user.name}</strong> (${user.userId})? This action cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel',
			confirmCallback: async () => {
				try {
					await this.userService.deleteUser(user.userId);
					this.notificationService.showSnackbar(`User "${user.name}" deleted successfully`);
					await this.navigationService.navigateTo('/users', {}, true);
				} catch (error) {
					console.error('Error deleting user:', error);
					this.notificationService.showSnackbar('Failed to delete user');
				}
			}
		});
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
			if (errors['minlength'])
				return `Password must be at least ${errors['minlength'].requiredLength} characters long`;
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
}
