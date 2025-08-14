import { Component, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
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
	hasAccessSettingsChanges = signal(false);

	adminCredentialsForm = new FormGroup({
		adminUsername: new FormControl({ value: '', disabled: true }, [Validators.required]),
		adminPassword: new FormControl('', [Validators.required, Validators.minLength(4)])
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
	}

	async ngOnInit() {
		this.isLoading.set(true);
		await this.loadAdminUsername();
		await this.loadAccessSettings();
		this.isLoading.set(false);
	}

	private async loadAdminUsername() {
		const username = await this.authService.getUsername();
		if (!username) {
			console.error('Admin username not found');
			this.notificationService.showSnackbar('Failed to load admin username');
			return;
		}

		this.adminCredentialsForm.get('adminUsername')?.setValue(username);
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

		const formData = this.adminCredentialsForm.value;
		const adminPassword = formData.adminPassword!;

		try {
			await this.authService.changePassword(adminPassword);
			this.notificationService.showSnackbar('Admin credentials updated successfully');
		} catch (error) {
			console.error('Error saving admin credentials:', error);
			this.notificationService.showSnackbar('Failed to save admin credentials');
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
	getAdminPasswordError(): string {
		const control = this.adminCredentialsForm.get('adminPassword')!;
		if (!control.touched || !control.errors) {
			return '';
		}

		const errors = control.errors;
		if (errors['required']) {
			return 'Admin password is required';
		}
		if (errors['minlength']) {
			return `Admin password must be at least ${errors['minlength'].requiredLength} characters`;
		}

		return '';
	}
}
