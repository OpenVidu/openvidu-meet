import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NotificationService } from '../../../services';
import { LogoSelectorComponent } from '../../../components';

interface AccessPermissions {
	authenticationForJoining: 'everyone' | 'only-moderators' | 'nobody';
	adminPassword: string;
}

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
		MatDividerModule,
		ReactiveFormsModule,
		LogoSelectorComponent
	],
	templateUrl: './preferences.component.html',
	styleUrl: './preferences.component.scss'
})
export class PreferencesComponent implements OnInit {
	private notificationService = inject(NotificationService);
	private formBuilder = inject(FormBuilder);

	// Signals for reactive state management
	isLoading = signal(false);
	isSavingBranding = signal(false);
	isSavingAccess = signal(false);

	accessForm!: FormGroup;

	accessData = signal<AccessPermissions>({
		authenticationForJoining: 'everyone',
		adminPassword: ''
	});

	// Authentication options for dropdown
	authenticationOptions = [
		{ value: 'everyone', label: 'Everyone' },
		{ value: 'only-moderators', label: 'Only Moderators' },
		{ value: 'nobody', label: 'Nobody' }
	];

	ngOnInit(): void {
		this.initializeForms();
		this.loadSettings();
	}

	private initializeForms(): void {
		this.accessForm = this.formBuilder.group({
			authenticationForJoining: ['everyone', [Validators.required]],
			adminPassword: ['', [Validators.required, Validators.minLength(8)]]
		});
	}

	private loadSettings(): void {
		this.isLoading.set(true);

		// Load access settings
		this.accessData.set({
			authenticationForJoining: 'everyone',
			adminPassword: ''
		});

		this.accessForm.patchValue({
			authenticationForJoining: this.accessData().authenticationForJoining,
			adminPassword: this.accessData().adminPassword
		});

		this.isLoading.set(false);
	}

	onSaveAccess(): void {
		if (this.accessForm.invalid) {
			this.markFormGroupTouched(this.accessForm);
			return;
		}

		this.isSavingAccess.set(true);
		const formData = this.accessForm.value;

		// Simulate API call
		setTimeout(() => {
			this.accessData.set({
				authenticationForJoining: formData.authenticationForJoining,
				adminPassword: formData.adminPassword
			});

			this.notificationService.showSnackbar('Access & Permissions settings saved successfully');
			this.isSavingAccess.set(false);
		}, 1000);
	}

	private markFormGroupTouched(formGroup: FormGroup): void {
		Object.keys(formGroup.controls).forEach((key) => {
			const control = formGroup.get(key);
			control?.markAsTouched();
		});
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
			authenticationForJoining: 'Authentication method',
			adminPassword: 'Admin password'
		};
		return labels[fieldName] || fieldName;
	}
}
