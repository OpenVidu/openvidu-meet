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
import { ProFeatureBadgeComponent } from '@lib/components';
import { AuthService, GlobalPreferencesService, NotificationService } from '@lib/services';
import { AuthMode } from '@lib/typings/ce';

@Component({
	selector: 'ov-preferences',
	standalone: true,
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
		ReactiveFormsModule,
		ProFeatureBadgeComponent
	],
	templateUrl: './users-permissions.component.html',
	styleUrl: './users-permissions.component.scss'
})
export class UsersPermissionsComponent implements OnInit {
	isLoading = signal(true);

	showCurrentPassword = signal(false);
	showNewPassword = signal(false);
	showConfirmPassword = signal(false);

	adminCredentialsForm = new FormGroup({
		username: new FormControl({ value: '', disabled: true }, [Validators.required]),
		currentPassword: new FormControl('', [Validators.required]),
		newPassword: new FormControl('', [Validators.required, Validators.minLength(5)]),
		confirmPassword: new FormControl('', [Validators.required])
	});
	accessSettingsForm = new FormGroup({
		authModeToAccessRoom: new FormControl(AuthMode.NONE, [Validators.required])
	});

	// Auth mode options for the select dropdown
	authModeOptions = [
		{ value: AuthMode.NONE, label: 'Nobody' },
		{ value: AuthMode.MODERATORS_ONLY, label: 'Only moderators' },
		{ value: AuthMode.ALL_USERS, label: 'Everyone' }
	];

	hasAccessSettingsChanges = signal(false);
	private initialAccessSettingsFormValue: any = null;

	constructor(
		private preferencesService: GlobalPreferencesService,
		private authService: AuthService,
		private notificationService: NotificationService
	) {
		// Track form changes
		this.accessSettingsForm.valueChanges.subscribe(() => {
			this.checkForAccessSettingsChanges();
		});

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
		await this.loadAdminUsername();
		await this.loadAccessSettings();
		this.isLoading.set(false);

		// Add custom validator for new password to prevent same password
		this.adminCredentialsForm.get('newPassword')?.addValidators(this.newPasswordValidator.bind(this));

		// Add custom validator for confirm password
		this.adminCredentialsForm.get('confirmPassword')?.addValidators(this.confirmPasswordValidator.bind(this));
	}

	private async loadAdminUsername() {
		const username = await this.authService.getUsername();
		if (!username) {
			console.error('Admin username not found');
			this.notificationService.showSnackbar('Failed to load admin username');
			return;
		}

		this.adminCredentialsForm.get('username')?.setValue(username);
	}

	private async loadAccessSettings() {
		try {
			const authMode = await this.preferencesService.getAuthModeToAccessRoom();
			this.accessSettingsForm.get('authModeToAccessRoom')?.setValue(authMode);

			// Store initial values after loading
			this.initialAccessSettingsFormValue = this.accessSettingsForm.value;
			this.hasAccessSettingsChanges.set(false);
		} catch (error) {
			console.error('Error loading security preferences:', error);
			this.notificationService.showSnackbar('Failed to load security preferences');
		}
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

	private checkForAccessSettingsChanges() {
		if (!this.initialAccessSettingsFormValue) {
			return;
		}

		const currentValue = this.accessSettingsForm.value;
		const hasChanges = JSON.stringify(currentValue) !== JSON.stringify(this.initialAccessSettingsFormValue);
		this.hasAccessSettingsChanges.set(hasChanges);
	}

	async onSaveAdminCredentials() {
		if (this.adminCredentialsForm.invalid) {
			return;
		}

		const { username, currentPassword, newPassword } = this.adminCredentialsForm.value;

		try {
			await this.authService.changePassword(currentPassword!, newPassword!);
			this.notificationService.showSnackbar('Admin credentials updated successfully');

			// Reset the form
			this.adminCredentialsForm.reset({
				username: username,
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

	async onSaveAccessSettings() {
		if (this.accessSettingsForm.invalid) {
			return;
		}

		const formData = this.accessSettingsForm.value;

		try {
			const securityPrefs = await this.preferencesService.getSecurityPreferences();
			securityPrefs.authentication.authModeToAccessRoom = formData.authModeToAccessRoom!;

			await this.preferencesService.saveSecurityPreferences(securityPrefs);
			this.notificationService.showSnackbar('Access & Permissions settings saved successfully');

			// Update initial values after successful save
			this.initialAccessSettingsFormValue = this.accessSettingsForm.value;
			this.hasAccessSettingsChanges.set(false);
		} catch (error) {
			console.error('Error saving access permissions:', error);
			this.notificationService.showSnackbar('Failed to save Access & Permissions settings');
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
