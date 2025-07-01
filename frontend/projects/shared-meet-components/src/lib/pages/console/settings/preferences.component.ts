import { CommonModule } from '@angular/common';
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
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LogoSelectorComponent } from '@lib/components';
import { AuthService, GlobalPreferencesService, NotificationService } from '@lib/services';
import { AuthMode } from '@lib/typings/ce';

@Component({
	selector: 'ov-preferences',
	standalone: true,
	imports: [
		CommonModule,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatSelectModule,
		MatSnackBarModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatDividerModule,
		ReactiveFormsModule,
		LogoSelectorComponent
	],
	templateUrl: './preferences.component.html',
	styleUrl: './preferences.component.scss'
})
export class PreferencesComponent implements OnInit {
	isLoading = signal(false);
	isSavingBranding = signal(false);
	isSavingAccess = signal(false);

	authForm = new FormGroup({
		authModeToAccessRoom: new FormControl(AuthMode.NONE, [Validators.required]),
		adminPassword: new FormControl('', [Validators.required, Validators.minLength(4)])
	});

	// Auth mode options for the select dropdown
	authModeOptions = [
		{ value: AuthMode.ALL_USERS, label: 'Everyone' },
		{ value: AuthMode.MODERATORS_ONLY, label: 'Only Moderators' },
		{ value: AuthMode.NONE, label: 'Nobody' }
	];

	constructor(
		private preferencesService: GlobalPreferencesService,
		private authService: AuthService,
		private notificationService: NotificationService
	) {}

	async ngOnInit() {
		await this.loadSettings();
	}

	private async loadSettings() {
		this.isLoading.set(true);

		try {
			const authMode = await this.preferencesService.getAuthModeToAccessRoom();
			this.authForm.get('authModeToAccessRoom')?.setValue(authMode);
		} catch (error) {
			console.error('Error loading security preferences:', error);
			this.notificationService.showSnackbar('Failed to load security preferences');
		}

		this.isLoading.set(false);
	}

	async onSaveAccess() {
		if (this.authForm.invalid) {
			return;
		}

		this.isSavingAccess.set(true);
		const formData = this.authForm.value;

		try {
			const securityPrefs = await this.preferencesService.getSecurityPreferences();
			securityPrefs.authentication.authModeToAccessRoom = formData.authModeToAccessRoom!;
			await this.preferencesService.saveSecurityPreferences(securityPrefs);

			if (formData.adminPassword) {
				await this.authService.changePassword(formData.adminPassword);
			}

			this.notificationService.showSnackbar('Access & Permissions settings saved successfully');
		} catch (error) {
			console.error('Error saving access permissions:', error);
			this.notificationService.showSnackbar('Failed to save Access & Permissions settings');
		} finally {
			this.isSavingAccess.set(false);
		}
	}

	// Utility methods for form validation
	getFieldError(formGroup: FormGroup, fieldName: string): string {
		const field = formGroup.get(fieldName);
		if (!field || !field.touched || !field.errors) {
			return '';
		}

		const errors = field.errors;
		if (errors['required']) {
			return `${this.getFieldLabel(fieldName)} is required`;
		}
		if (errors['minlength']) {
			return `${this.getFieldLabel(fieldName)} must be at least ${errors['minlength'].requiredLength} characters`;
		}
		if (errors['invalidUrl']) {
			return `${this.getFieldLabel(fieldName)} must be a valid URL`;
		}

		return '';
	}

	private getFieldLabel(fieldName: string): string {
		const labels: Record<string, string> = {
			logoUrl: 'Logo URL',
			authModeToAccessRoom: 'Authentication mode to access room',
			adminPassword: 'Admin password'
		};
		return labels[fieldName] || fieldName;
	}
}
