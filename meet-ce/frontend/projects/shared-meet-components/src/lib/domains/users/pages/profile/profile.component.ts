import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
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
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { DialogPresetsService } from '../../../../shared/services/dialog-presets.service';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { AuthService } from '../../../auth/services/auth.service';
import { ResetPasswordDialogComponent } from '../../components/reset-password-dialog/reset-password-dialog.component';
import { UpdateRoleDialogComponent } from '../../components/update-role-dialog/update-role-dialog.component';
import { UserService } from '../../services/user.service';
import { UsersUiUtils } from '../../utils/ui';

@Component({
	selector: 'ov-profile',
	imports: [
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatDividerModule,
		ReactiveFormsModule,
		TranslatePipe
	],
	templateUrl: './profile.component.html',
	styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
	private authService = inject(AuthService);
	private userService = inject(UserService);
	private notificationService = inject(NotificationService);
	private readonly translateService = inject(TranslateService);
	private dialogPresetsService = inject(DialogPresetsService);
	private route = inject(ActivatedRoute);
	private navigationService = inject(NavigationService);
	private dialog = inject(MatDialog);

	isLoading = signal(true);
	isOwnProfile = signal(true);
	isAdminViewing = signal(false);
	isRootAdmin = signal(false);

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

		// Add custom validators
		this.changePasswordForm.get('newPassword')?.addValidators(this.newPasswordValidator.bind(this));
		this.changePasswordForm.get('confirmPassword')?.addValidators(this.confirmPasswordValidator.bind(this));

		const userId = this.route.snapshot.paramMap.get('user-id');
		const authenticatedUserId = await this.authService.getUserId();
		const isAdmin = await this.authService.isAdmin();

		// Redirect to profile page if user tries to access their own profile through /users/:userId route
		if (userId && userId === authenticatedUserId) {
			await this.navigationService.navigateTo('/profile', {}, true);
			return;
		}

		try {
			if (userId && userId !== authenticatedUserId) {
				// Admin viewing another user's profile
				if (isAdmin) {
					this.isAdminViewing.set(true);
				}

				const [user, rootAdmin] = await Promise.all([
					this.userService.getUser(userId),
					this.userService.getRootAdmin()
				]);
				this.targetUser.set(user);
				this.isOwnProfile.set(false);
				this.isRootAdmin.set(UsersUiUtils.isRootAdmin(user, rootAdmin?.userId ?? ''));
			} else {
				// Own profile
				const user = await this.userService.getMe();
				this.targetUser.set(user);
				this.isOwnProfile.set(true);
				this.isAdminViewing.set(false);
			}
		} catch (error) {
			console.error('Error loading profile:', error);
			this.notificationService.showSnackbar(this.translateService.translate('USERS.ERRORS.PROFILE_LOAD_FAILED'));
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
			await this.userService.changePassword(currentPassword!, newPassword!);

			this.changePasswordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
			this.showCurrentPassword.set(false);
			this.showNewPassword.set(false);
			this.showConfirmPassword.set(false);

			this.notificationService.showSnackbar(this.translateService.translate('USERS.ERRORS.PASSWORD_UPDATED_SUCCESS'));
		} catch (error) {
			console.error('Error changing password:', error);
			if ((error as HttpErrorResponse).status === 400) {
				const control = this.changePasswordForm.get('currentPassword');
				control?.setErrors({ invalidPassword: true });
				control?.markAsTouched();
				this.notificationService.showSnackbar(this.translateService.translate('USERS.ERRORS.CURRENT_PASSWORD_INCORRECT'));
			} else {
				this.notificationService.showSnackbar(this.translateService.translate('USERS.ERRORS.PASSWORD_UPDATE_FAILED'));
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
		// Role is shown in the users list — invalidate it so the change is reflected on return
		this.navigationService.invalidateCachedRoute('users');
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
			...this.dialogPresetsService.getDeleteUserDialogPreset(user.name, user.userId),
			confirmCallback: async () => {
				try {
					await this.userService.deleteUser(user.userId);
					this.notificationService.showSnackbar(
						`${this.translateService.translate('USERS.ERRORS.USER_DELETED_PREFIX')}${user.name}${this.translateService.translate('USERS.ERRORS.USER_DELETED_SUFFIX')}`
					);
					await this.navigationService.navigateToAndInvalidate('/users', 'users', {}, true);
				} catch (error) {
					console.error('Error deleting user:', error);
					this.notificationService.showSnackbar(this.translateService.translate('USERS.ERRORS.USER_DELETE_FAILED'));
				}
			}
		});
	}

	// ─── Error helpers ──────────────────────────────────────────────────────────

	getCurrentPasswordError(): string | null {
		const control = this.changePasswordForm.get('currentPassword');
		if (control?.errors && control.touched) {
			if (control.errors['required']) return this.translateService.translate('USERS.ERRORS.CURRENT_PASSWORD_REQUIRED');
			if (control.errors['invalidPassword']) return this.translateService.translate('USERS.ERRORS.CURRENT_PASSWORD_INCORRECT');
		}
		return null;
	}

	getNewPasswordError(): string | null {
		const control = this.changePasswordForm.get('newPassword');
		if (control?.errors && control.touched) {
			const errors = control.errors;
			if (errors['required']) return this.translateService.translate('USERS.ERRORS.NEW_PASSWORD_REQUIRED');
			if (errors['minlength'])
				return `${this.translateService.translate('USERS.ERRORS.NEW_PASSWORD_MIN_LENGTH')} ${errors['minlength'].requiredLength} ${this.translateService.translate('USERS.ERRORS.NEW_PASSWORD_MIN_LENGTH_SUFFIX')}`;
			if (errors['samePassword']) return this.translateService.translate('USERS.ERRORS.NEW_PASSWORD_SAME');
		}
		return null;
	}

	getConfirmPasswordError(): string | null {
		const control = this.changePasswordForm.get('confirmPassword');
		if (control?.touched && control?.errors) {
			if (control.errors['required']) return this.translateService.translate('USERS.ERRORS.CONFIRM_PASSWORD_REQUIRED');
			if (control.errors['passwordMismatch']) return this.translateService.translate('USERS.ERRORS.CONFIRM_PASSWORD_MISMATCH');
		}
		return null;
	}
}
