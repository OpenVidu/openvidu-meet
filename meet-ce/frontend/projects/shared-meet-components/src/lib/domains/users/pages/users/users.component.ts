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
import { NotificationService } from '../../../../shared/services/notification.service';
import { AuthService } from '../../../auth/services/auth.service';
import { UserService } from '../../services/user.service';

@Component({
	selector: 'ov-users',
	imports: [
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
	templateUrl: './users.component.html',
	styleUrl: './users.component.scss'
})
export class UsersComponent implements OnInit {
	isLoading = signal(true);

	showCurrentPassword = signal(false);
	showNewPassword = signal(false);
	showConfirmPassword = signal(false);

	adminCredentialsForm = new FormGroup({
		userId: new FormControl({ value: '', disabled: true }, [Validators.required]),
		currentPassword: new FormControl('', [Validators.required]),
		newPassword: new FormControl('', [Validators.required, Validators.minLength(5)]),
		confirmPassword: new FormControl('', [Validators.required])
	});

	constructor(
		private authService: AuthService,
		private userService: UserService,
		private notificationService: NotificationService
	) {
		// Clear invalid password error when user starts typing
		this.adminCredentialsForm.get('currentPassword')?.valueChanges.subscribe(() => {
			const control = this.adminCredentialsForm.get('currentPassword');
			if (control?.errors?.['invalidPassword']) {
				// Remove only the invalidPassword error, keep others
				const errors = { ...control.errors };
				delete errors['invalidPassword'];
				control.setErrors(Object.keys(errors).length > 0 ? errors : null);
			}

			// Revalidate new password when current password changes
			const newPasswordControl = this.adminCredentialsForm.get('newPassword');
			if (newPasswordControl?.value) {
				newPasswordControl.updateValueAndValidity();
			}
		});

		// Revalidate confirm password when new password changes
		this.adminCredentialsForm.get('newPassword')?.valueChanges.subscribe(() => {
			const confirmPasswordControl = this.adminCredentialsForm.get('confirmPassword');
			if (confirmPasswordControl?.value) {
				confirmPasswordControl.updateValueAndValidity();
			}
		});
	}

	async ngOnInit() {
		this.isLoading.set(true);
		await this.loadAdminUserId();
		this.isLoading.set(false);

		// Add custom validator for new password to prevent same password
		this.adminCredentialsForm.get('newPassword')?.addValidators(this.newPasswordValidator.bind(this));

		// Add custom validator for confirm password
		this.adminCredentialsForm.get('confirmPassword')?.addValidators(this.confirmPasswordValidator.bind(this));
	}

	private async loadAdminUserId() {
		const userId = await this.authService.getUserId();
		if (!userId) {
			console.error('Admin user ID not found');
			this.notificationService.showSnackbar('Failed to load admin user ID');
			return;
		}

		this.adminCredentialsForm.get('userId')?.setValue(userId);
	}

	private newPasswordValidator(control: AbstractControl): ValidationErrors | null {
		const currentPassword = this.adminCredentialsForm?.get('currentPassword')?.value;
		const newPassword = control.value;

		if (!currentPassword || !newPassword) {
			return null;
		}

		return currentPassword === newPassword ? { samePassword: true } : null;
	}

	private confirmPasswordValidator(control: AbstractControl): ValidationErrors | null {
		const newPassword = this.adminCredentialsForm?.get('newPassword')?.value;
		const confirmPassword = control.value;

		if (!newPassword || !confirmPassword) {
			return null;
		}

		return newPassword === confirmPassword ? null : { passwordMismatch: true };
	}

	async onSaveAdminCredentials() {
		if (this.adminCredentialsForm.invalid) {
			return;
		}

		const { userId, currentPassword, newPassword } = this.adminCredentialsForm.value;

		try {
			await this.userService.changePassword(currentPassword!, newPassword!);
			this.notificationService.showSnackbar('Admin credentials updated successfully');

			// Reset the form
			this.adminCredentialsForm.reset({
				userId,
				currentPassword: '',
				newPassword: '',
				confirmPassword: ''
			});

			// Hide all password fields
			this.showCurrentPassword.set(false);
			this.showNewPassword.set(false);
			this.showConfirmPassword.set(false);
		} catch (error) {
			console.error('Error saving admin credentials:', error);

			if ((error as HttpErrorResponse).status === 400) {
				// Set error on current password field
				const currentPasswordControl = this.adminCredentialsForm.get('currentPassword');
				currentPasswordControl?.setErrors({ invalidPassword: true });
				currentPasswordControl?.markAsTouched();

				this.notificationService.showSnackbar('Invalid current password');
			} else {
				this.notificationService.showSnackbar('Failed to save admin credentials');
			}
		}
	}

	// Utility methods for form validation

	getCurrentPasswordError(): string | null {
		const control = this.adminCredentialsForm.get('currentPassword');

		if (control?.errors && control.touched) {
			if (control.errors['required']) {
				return 'Current password is required';
			}
			if (control.errors['invalidPassword']) {
				return 'Current password is incorrect';
			}
		}

		return null;
	}

	getNewPasswordError(): string | null {
		const control = this.adminCredentialsForm.get('newPassword');

		if (control?.errors && control.touched) {
			const errors = control.errors;
			if (errors['required']) {
				return 'New password is required';
			}
			if (errors['minlength']) {
				return `Password must be at least ${errors['minlength'].requiredLength} characters long`;
			}
			if (errors['samePassword']) {
				return 'New password must be different from current password';
			}
		}

		return null;
	}

	getConfirmPasswordError(): string | null {
		const control = this.adminCredentialsForm.get('confirmPassword');

		if (control?.touched && control?.errors) {
			if (control.errors['required']) {
				return 'Please confirm your password';
			}
			if (control.errors['passwordMismatch']) {
				return 'Passwords do not match';
			}
		}

		return null;
	}
}
